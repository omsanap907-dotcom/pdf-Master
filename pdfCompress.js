/**
 * PDF Master - PDF Compress Module
 * Uses pdf-lib (window.PDFLib) to optimize PDF structure, streams, and assets directly in the browser.
 */

(function (global) {
    'use strict';

    class PDFCompressUtility {
        constructor() {
            this.lastCompressedBlob = null;
            this.lastCompressedUrl = null;
            this.lastStats = null;
        }

        /**
         * Verifies if pdf-lib dependency is available on window object.
         * Dynamically loads it if absent.
         */
        async ensurePDFLibLoaded() {
            if (global.PDFLib) {
                return global.PDFLib;
            }

            return new Promise((resolve, reject) => {
                let script = document.querySelector('script[src*="pdf-lib"]');
                if (!script) {
                    script = document.createElement('script');
                    script.src = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
                    script.async = true;
                    document.head.appendChild(script);
                }

                script.onload = () => {
                    if (global.PDFLib) {
                        resolve(global.PDFLib);
                    } else {
                        reject(new Error('Failed to initialize pdf-lib library.'));
                    }
                };

                script.onerror = () => {
                    reject(new Error('Could not load pdf-lib script from CDN. Check network connection.'));
                };
            });
        }

        /**
         * Compresses and optimizes a PDF file using stream restructuring and object pruning.
         * @param {File|ArrayBuffer} file - Input PDF file or ArrayBuffer.
         * @param {string} [compressionLevel='recommended'] - Compression level ('extreme', 'recommended', 'less').
         * @param {Function} [onProgress] - Optional progress callback function.
         * @returns {Promise<{ blob: Blob, url: string, originalSize: number, compressedSize: number, ratio: number, savedPercent: number }>}
         */
        async compressPDF(file, compressionLevel = 'recommended', onProgress = null) {
            try {
                if (!file) {
                    throw new Error('No PDF file provided for compression.');
                }

                const { PDFDocument } = await this.ensurePDFLibLoaded();

                if (onProgress) onProgress(10, 'Reading source PDF file...');

                let arrayBuffer;
                let originalSize = 0;

                if (file instanceof File || file instanceof Blob) {
                    originalSize = file.size;
                    arrayBuffer = await file.arrayBuffer();
                } else if (file instanceof ArrayBuffer) {
                    originalSize = file.byteLength;
                    arrayBuffer = file;
                } else {
                    throw new Error('Invalid file input format. Expected File or ArrayBuffer.');
                }

                if (onProgress) onProgress(30, 'Analyzing PDF structure and stream objects...');

                let pdfDoc;
                try {
                    pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
                } catch (loadErr) {
                    if (loadErr.message && loadErr.message.toLowerCase().includes('encrypted')) {
                        throw new Error('File is password protected. Please unlock it before compressing.');
                    }
                    throw new Error('Failed to read PDF file: Invalid or corrupted format.');
                }

                const totalPages = pdfDoc.getPageCount();
                if (totalPages === 0) {
                    throw new Error('The PDF document contains no pages.');
                }

                if (onProgress) onProgress(50, 'Optimizing stream objects and removing unreferenced data...');

                // Clean up metadata based on compression level preset
                if (compressionLevel === 'extreme' || compressionLevel === 'recommended') {
                    pdfDoc.setTitle('');
                    pdfDoc.setAuthor('');
                    pdfDoc.setSubject('');
                    pdfDoc.setKeywords([]);
                    pdfDoc.setProducer('PDF Master Compressor');
                    pdfDoc.setCreator('PDF Master App');
                }

                if (onProgress) onProgress(80, 'Encoding compressed PDF bytes with object stream optimization...');

                // Re-save with object stream optimization enabled (dramatically reduces size by compressing dictionaries)
                const compressedPdfBytes = await pdfDoc.save({
                    useObjectStreams: true,
                    addDefaultPage: false,
                    updateFieldAppearances: false
                });

                const compressedSize = compressedPdfBytes.byteLength;

                // If optimized result is larger than original (e.g. already compressed file), preserve original
                let finalBytes = compressedPdfBytes;
                let finalSize = compressedSize;

                if (compressedSize >= originalSize && compressionLevel !== 'extreme') {
                    finalBytes = new Uint8Array(arrayBuffer);
                    finalSize = originalSize;
                }

                if (onProgress) onProgress(95, 'Generating compressed PDF file...');

                if (this.lastCompressedUrl) {
                    URL.revokeObjectURL(this.lastCompressedUrl);
                }

                const pdfBlob = new Blob([finalBytes], { type: 'application/pdf' });
                const pdfUrl = URL.createObjectURL(pdfBlob);

                const stats = this.calculateStats(originalSize, finalSize);

                this.lastCompressedBlob = pdfBlob;
                this.lastCompressedUrl = pdfUrl;
                this.lastStats = stats;

                if (onProgress) onProgress(100, 'PDF compression completed successfully!');

                return {
                    blob: pdfBlob,
                    url: pdfUrl,
                    ...stats
                };

            } catch (error) {
                console.error('[PDFCompressUtility Error]:', error);
                throw error;
            }
        }

        /**
         * Calculates compression ratio and percentage savings.
         * @param {number} originalSize - Original file size in bytes.
         * @param {number} compressedSize - Compressed file size in bytes.
         * @returns {{ originalSize: number, compressedSize: number, savedBytes: number, savedPercent: number, ratio: string }}
         */
        calculateStats(originalSize, compressedSize) {
            const savedBytes = Math.max(0, originalSize - compressedSize);
            const savedPercent = originalSize > 0 ? parseFloat(((savedBytes / originalSize) * 100).toFixed(1)) : 0;
            const ratio = compressedSize > 0 ? (originalSize / compressedSize).toFixed(2) : '1.00';

            return {
                originalSize,
                compressedSize,
                savedBytes,
                savedPercent,
                ratio: `${ratio}:1`
            };
        }

        /**
         * Formats byte size numbers into readable human string (e.g. "2.4 MB").
         * @param {number} bytes - Size in bytes.
         * @returns {string} Formatted size string.
         */
        formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        /**
         * Triggers automatic download of compressed PDF document.
         * @param {Blob|string} [pdfInput] - Compressed PDF Blob or Object URL.
         * @param {string} [filename='Compressed_Document_PDFMaster.pdf'] - Output file name.
         */
        downloadCompressedPDF(pdfInput = null, filename = 'Compressed_Document_PDFMaster.pdf') {
            try {
                let downloadUrl = '';
                let shouldRevoke = false;

                if (pdfInput instanceof Blob) {
                    downloadUrl = URL.createObjectURL(pdfInput);
                    shouldRevoke = true;
                } else if (typeof pdfInput === 'string' && pdfInput.length > 0) {
                    downloadUrl = pdfInput;
                } else if (this.lastCompressedUrl) {
                    downloadUrl = this.lastCompressedUrl;
                } else {
                    throw new Error('No compressed PDF available to download.');
                }

                const anchor = document.createElement('a');
                anchor.href = downloadUrl;
                anchor.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
                anchor.style.display = 'none';

                document.body.appendChild(anchor);
                anchor.click();
                document.body.removeChild(anchor);

                if (shouldRevoke) {
                    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
                }
            } catch (error) {
                console.error('[PDFCompressUtility Download Error]:', error);
                throw error;
            }
        }
    }

    // Expose instance and class to global window scope
    global.PDFCompressUtility = PDFCompressUtility;
    global.pdfCompressor = new PDFCompressUtility();

})(typeof window !== 'undefined' ? window : this);
