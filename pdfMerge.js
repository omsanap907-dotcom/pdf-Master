/**
 * PDF Master - PDF Merge Module
 * Uses pdf-lib (window.PDFLib) to merge multiple PDF documents directly in the browser.
 */

(function (global) {
    'use strict';

    class PDFMergeUtility {
        constructor() {
            this.lastMergedBlob = null;
            this.lastMergedUrl = null;
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
                // Check if script tag already exists
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
         * Merges an array of File objects or ArrayBuffers into a single PDF document.
         * @param {Array<File|ArrayBuffer>} files - Array of PDF files to merge.
         * @param {Function} [onProgress] - Optional callback for tracking progress (0-100%).
         * @returns {Promise<{ blob: Blob, url: string, pageCount: number }>}
         */
        async mergePDFs(files, onProgress = null) {
            try {
                // Validation checks
                if (!files || files.length === 0) {
                    throw new Error('No PDF files provided for merging.');
                }

                if (files.length < 2) {
                    throw new Error('Please select at least two PDF files to merge.');
                }

                const { PDFDocument } = await this.ensurePDFLibLoaded();

                // Create a new target merged PDF document
                const mergedPdf = await PDFDocument.create();
                let totalMergedPages = 0;
                const totalFiles = files.length;

                for (let i = 0; i < totalFiles; i++) {
                    const file = files[i];
                    
                    if (onProgress && typeof onProgress === 'function') {
                        const percent = Math.round((i / totalFiles) * 80);
                        onProgress(percent, `Processing file ${i + 1} of ${totalFiles}: ${file.name || 'Document'}`);
                    }

                    let arrayBuffer;
                    if (file instanceof File || file instanceof Blob) {
                        arrayBuffer = await file.arrayBuffer();
                    } else if (file instanceof ArrayBuffer) {
                        arrayBuffer = file;
                    } else {
                        throw new Error(`Invalid file input at index ${i}. Expected File or ArrayBuffer.`);
                    }

                    let srcPdf;
                    try {
                        srcPdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
                    } catch (loadErr) {
                        const fileName = file.name ? `"${file.name}"` : `Document #${i + 1}`;
                        if (loadErr.message && loadErr.message.toLowerCase().includes('encrypted')) {
                            throw new Error(`${fileName} is password protected. Please unlock it before merging.`);
                        }
                        throw new Error(`Failed to read ${fileName}: Invalid or corrupted PDF format.`);
                    }

                    const pageIndices = srcPdf.getPageIndices();
                    if (pageIndices.length === 0) {
                        console.warn(`File "${file.name || i}" contains no pages. Skipping.`);
                        continue;
                    }

                    // Copy all pages from source to target document
                    const copiedPages = await mergedPdf.copyPages(srcPdf, pageIndices);
                    copiedPages.forEach((page) => {
                        mergedPdf.addPage(page);
                        totalMergedPages++;
                    });
                }

                if (totalMergedPages === 0) {
                    throw new Error('The selected PDF documents contained no valid pages to merge.');
                }

                if (onProgress && typeof onProgress === 'function') {
                    onProgress(90, 'Generating final merged PDF...');
                }

                // Save merged PDF to Uint8Array bytes
                const mergedPdfBytes = await mergedPdf.save();

                // Revoke previous URL to prevent memory leaks
                if (this.lastMergedUrl) {
                    URL.revokeObjectURL(this.lastMergedUrl);
                }

                // Create Blob and Object URL
                const pdfBlob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
                const pdfUrl = URL.createObjectURL(pdfBlob);

                this.lastMergedBlob = pdfBlob;
                this.lastMergedUrl = pdfUrl;

                if (onProgress && typeof onProgress === 'function') {
                    onProgress(100, 'Merge completed successfully!');
                }

                return {
                    blob: pdfBlob,
                    url: pdfUrl,
                    pageCount: totalMergedPages
                };

            } catch (error) {
                console.error('[PDFMergeUtility Error]:', error);
                throw error;
            }
        }

        /**
         * Renders an interactive preview of the merged PDF into an HTML iframe or object tag.
         * @param {string|Blob} pdfInput - PDF Object URL or Blob object.
         * @param {HTMLElement} containerElement - DOM container to embed preview in.
         */
        previewMergedPDF(pdfInput, containerElement) {
            try {
                if (!containerElement) {
                    throw new Error('Preview container element is required.');
                }

                let previewUrl = '';
                if (typeof pdfInput === 'string') {
                    previewUrl = pdfInput;
                } else if (pdfInput instanceof Blob) {
                    previewUrl = URL.createObjectURL(pdfInput);
                } else if (this.lastMergedUrl) {
                    previewUrl = this.lastMergedUrl;
                } else {
                    throw new Error('No valid PDF URL or Blob available for preview.');
                }

                containerElement.innerHTML = ''; // Clear existing container

                const iframe = document.createElement('iframe');
                iframe.src = previewUrl;
                iframe.title = 'Merged PDF Document Preview';
                iframe.className = 'w-full h-full min-h-[400px] border-0 rounded-xl shadow-inner';
                iframe.setAttribute('type', 'application/pdf');

                containerElement.appendChild(iframe);
            } catch (error) {
                console.error('[PDFMergeUtility Preview Error]:', error);
                if (containerElement) {
                    containerElement.innerHTML = `
                        <div class="p-6 text-center text-rose-500 bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800">
                            <span class="material-symbols-outlined text-3xl mb-2">error</span>
                            <p class="text-xs font-semibold">Unable to load preview: ${error.message}</p>
                        </div>
                    `;
                }
            }
        }

        /**
         * Triggers automatic download of the merged PDF file.
         * @param {Blob|string} [pdfInput] - Merged PDF Blob or Object URL.
         * @param {string} [filename='Merged_Document_PDFMaster.pdf'] - Download file name.
         */
        downloadMergedPDF(pdfInput = null, filename = 'Merged_Document_PDFMaster.pdf') {
            try {
                let downloadUrl = '';
                let shouldRevoke = false;

                if (pdfInput instanceof Blob) {
                    downloadUrl = URL.createObjectURL(pdfInput);
                    shouldRevoke = true;
                } else if (typeof pdfInput === 'string' && pdfInput.length > 0) {
                    downloadUrl = pdfInput;
                } else if (this.lastMergedUrl) {
                    downloadUrl = this.lastMergedUrl;
                } else {
                    throw new Error('No merged PDF file available to download.');
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
                console.error('[PDFMergeUtility Download Error]:', error);
                throw error;
            }
        }
    }

    // Expose instance and class to window context
    global.PDFMergeUtility = PDFMergeUtility;
    global.pdfMerger = new PDFMergeUtility();

})(typeof window !== 'undefined' ? window : this);
