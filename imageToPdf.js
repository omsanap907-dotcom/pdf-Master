/**
 * PDF Master - Images to PDF Module
 * Uses pdf-lib (window.PDFLib) to combine, reorder, and convert images into a PDF document directly in the browser.
 */

(function (global) {
    'use strict';

    class ImageToPDFUtility {
        constructor() {
            this.images = []; // Array of { id, file, src, name, size, type }
            this.lastPdfBlob = null;
            this.lastPdfUrl = null;
        }

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

        async addImages(files) {
            const addedList = [];
            const fileArray = Array.from(files || []);

            for (const file of fileArray) {
                if (!file.type.startsWith('image/')) {
                    console.warn(`File "${file.name}" is not a supported image format.`);
                    continue;
                }

                const dataUrl = await this.readFileAsDataURL(file);
                const imgItem = {
                    id: 'img_' + Math.random().toString(36).substring(2, 9),
                    file: file,
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    src: dataUrl
                };

                this.images.push(imgItem);
                addedList.push(imgItem);
            }

            return addedList;
        }

        readFileAsDataURL(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = (err) => reject(err);
                reader.readAsDataURL(file);
            });
        }

        reorderImages(fromIndex, toIndex) {
            if (
                fromIndex < 0 ||
                fromIndex >= this.images.length ||
                toIndex < 0 ||
                toIndex >= this.images.length
            ) {
                return false;
            }

            const [movedItem] = this.images.splice(fromIndex, 1);
            this.images.splice(toIndex, 0, movedItem);
            return true;
        }

        removeImage(indexOrId) {
            if (typeof indexOrId === 'number') {
                if (indexOrId >= 0 && indexOrId < this.images.length) {
                    this.images.splice(indexOrId, 1);
                    return true;
                }
            } else if (typeof indexOrId === 'string') {
                const idx = this.images.findIndex(img => img.id === indexOrId);
                if (idx !== -1) {
                    this.images.splice(idx, 1);
                    return true;
                }
            }
            return false;
        }

        clearImages() {
            this.images = [];
            if (this.lastPdfUrl) {
                URL.revokeObjectURL(this.lastPdfUrl);
                this.lastPdfUrl = null;
            }
            this.lastPdfBlob = null;
        }

        async convertImageToJpegPngBuffer(imgSrc, outputType = 'image/jpeg') {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth || img.width;
                    canvas.height = img.naturalHeight || img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);

                    canvas.toBlob((blob) => {
                        if (!blob) {
                            reject(new Error('Canvas to Blob conversion failed.'));
                            return;
                        }
                        blob.arrayBuffer().then(resolve).catch(reject);
                    }, outputType, 0.92);
                };
                img.onerror = () => reject(new Error('Failed to load image for canvas rendering.'));
                img.src = imgSrc;
            });
        }

        async convertImagesToPDF(imagesList = null, options = {}, onProgress = null) {
            try {
                const targetImages = imagesList || this.images;
                if (!targetImages || targetImages.length === 0) {
                    throw new Error('No images selected for PDF conversion.');
                }

                const { PDFDocument, PageSizes } = await this.ensurePDFLibLoaded();

                if (onProgress) onProgress(10, 'Initializing new PDF document...');

                const pdfDoc = await PDFDocument.create();
                const total = targetImages.length;

                const pageSizeMode = options.pageSize || 'A4'; // 'A4', 'LETTER', 'AUTO'
                const margin = typeof options.margin === 'number' ? options.margin : 20;

                for (let i = 0; i < total; i++) {
                    const percent = Math.round(10 + ((i + 1) / total) * 75);
                    if (onProgress) {
                        onProgress(percent, `Processing image ${i + 1} of ${total}: ${targetImages[i].name || 'Image'}`);
                    }

                    const imgItem = targetImages[i];
                    let embeddedImg;

                    try {
                        if (imgItem.type === 'image/jpeg' || imgItem.type === 'image/jpg') {
                            const buffer = await imgItem.file.arrayBuffer();
                            embeddedImg = await pdfDoc.embedJpg(buffer);
                        } else if (imgItem.type === 'image/png') {
                            const buffer = await imgItem.file.arrayBuffer();
                            embeddedImg = await pdfDoc.embedPng(buffer);
                        } else {
                            // Convert WEBP, GIF, SVG, BMP, or other format to JPEG buffer via Canvas
                            const buffer = await this.convertImageToJpegPngBuffer(imgItem.src, 'image/jpeg');
                            embeddedImg = await pdfDoc.embedJpg(buffer);
                        }
                    } catch (embedErr) {
                        // Fallback conversion if raw buffer embedding fails
                        const buffer = await this.convertImageToJpegPngBuffer(imgItem.src, 'image/jpeg');
                        embeddedImg = await pdfDoc.embedJpg(buffer);
                    }

                    const imgDims = embeddedImg.scale(1.0);
                    let pageWidth, pageHeight;

                    if (pageSizeMode === 'LETTER') {
                        [pageWidth, pageHeight] = PageSizes.Letter;
                    } else if (pageSizeMode === 'AUTO') {
                        pageWidth = imgDims.width + (margin * 2);
                        pageHeight = imgDims.height + (margin * 2);
                    } else { // Default A4
                        [pageWidth, pageHeight] = PageSizes.A4;
                    }

                    const page = pdfDoc.addPage([pageWidth, pageHeight]);
                    const availWidth = pageWidth - (margin * 2);
                    const availHeight = pageHeight - (margin * 2);

                    const widthScale = availWidth / imgDims.width;
                    const heightScale = availHeight / imgDims.height;
                    const scale = Math.min(widthScale, heightScale, 1.0);

                    const finalWidth = imgDims.width * scale;
                    const finalHeight = imgDims.height * scale;

                    const x = (pageWidth - finalWidth) / 2;
                    const y = (pageHeight - finalHeight) / 2;

                    page.drawImage(embeddedImg, {
                        x,
                        y,
                        width: finalWidth,
                        height: finalHeight
                    });
                }

                if (onProgress) onProgress(90, 'Compiling and saving final PDF document...');

                const pdfBytes = await pdfDoc.save();

                if (this.lastPdfUrl) {
                    URL.revokeObjectURL(this.lastPdfUrl);
                }

                const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
                const pdfUrl = URL.createObjectURL(pdfBlob);

                this.lastPdfBlob = pdfBlob;
                this.lastPdfUrl = pdfUrl;

                if (onProgress) onProgress(100, 'Image to PDF conversion completed!');

                return {
                    blob: pdfBlob,
                    url: pdfUrl,
                    pageCount: total
                };

            } catch (error) {
                console.error('[ImageToPDFUtility Error]:', error);
                throw error;
            }
        }

        downloadPDF(pdfInput = null, filename = 'Images_Converted_PDFMaster.pdf') {
            try {
                let downloadUrl = '';
                let shouldRevoke = false;

                if (pdfInput instanceof Blob) {
                    downloadUrl = URL.createObjectURL(pdfInput);
                    shouldRevoke = true;
                } else if (typeof pdfInput === 'string' && pdfInput.length > 0) {
                    downloadUrl = pdfInput;
                } else if (this.lastPdfUrl) {
                    downloadUrl = this.lastPdfUrl;
                } else {
                    throw new Error('No converted PDF file available to download.');
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
                console.error('[ImageToPDFUtility Download Error]:', error);
                throw error;
            }
        }
    }

    global.ImageToPDFUtility = ImageToPDFUtility;
    global.imageToPdf = new ImageToPDFUtility();

})(typeof window !== 'undefined' ? window : this);
