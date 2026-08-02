/**
 * PDF Master - PDF Split Module
 * Uses pdf-lib (window.PDFLib) to split PDF documents and extract pages directly in the browser.
 */

(function (global) {
    'use strict';

    class PDFSplitUtility {
        constructor() {
            this.lastExtractedBlob = null;
            this.lastExtractedUrl = null;
            this.loadedPdfDoc = null;
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
         * Parses page range strings like "1, 3-5, 8" into 0-indexed page numbers.
         * @param {string} rangeStr - User input string for page selection.
         * @param {number} totalPages - Total pages in the PDF file.
         * @returns {Array<number>} Array of 0-indexed page numbers.
         */
        parsePageRange(rangeStr, totalPages) {
            if (!rangeStr || rangeStr.trim() === '') {
                // Default to all pages if no range provided
                return Array.from({ length: totalPages }, (_, i) => i);
            }

            const indices = new Set();
            const parts = rangeStr.split(',');

            for (let part of parts) {
                part = part.trim();
                if (part.includes('-')) {
                    const [startStr, endStr] = part.split('-');
                    const start = parseInt(startStr, 10);
                    const end = parseInt(endStr, 10);

                    if (!isNaN(start) && !isNaN(end)) {
                        const min = Math.max(1, Math.min(start, end));
                        const max = Math.min(totalPages, Math.max(start, end));
                        for (let i = min; i <= max; i++) {
                            indices.add(i - 1); // 0-indexed
                        }
                    }
                } else {
                    const pageNum = parseInt(part, 10);
                    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
                        indices.add(pageNum - 1); // 0-indexed
                    }
                }
            }

            return Array.from(indices).sort((a, b) => a - b);
        }

        /**
         * Extracts selected pages from a source PDF document into a new PDF.
         * @param {File|ArrayBuffer} file - Source PDF file input.
         * @param {string|Array<number>} pageSelection - Range string (e.g. "1, 3-5") or array of 1-based page numbers.
         * @param {Function} [onProgress] - Optional progress callback function.
         * @returns {Promise<{ blob: Blob, url: string, pageCount: number, extractedIndices: Array<number> }>}
         */
        async extractPages(file, pageSelection, onProgress = null) {
            try {
                if (!file) {
                    throw new Error('No PDF file provided for extraction.');
                }

                const { PDFDocument } = await this.ensurePDFLibLoaded();

                if (onProgress) onProgress(10, 'Loading source PDF document...');

                let arrayBuffer;
                if (file instanceof File || file instanceof Blob) {
                    arrayBuffer = await file.arrayBuffer();
                } else if (file instanceof ArrayBuffer) {
                    arrayBuffer = file;
                } else {
                    throw new Error('Invalid file input. Expected File or ArrayBuffer.');
                }

                let srcPdf;
                try {
                    srcPdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
                } catch (err) {
                    if (err.message && err.message.toLowerCase().includes('encrypted')) {
                        throw new Error('File is password protected. Please unlock it before extracting pages.');
                    }
                    throw new Error('Failed to read PDF document: Invalid or corrupted format.');
                }

                const totalPages = srcPdf.getPageCount();
                if (totalPages === 0) {
                    throw new Error('The PDF document contains no pages.');
                }

                let targetIndices = [];
                if (typeof pageSelection === 'string') {
                    targetIndices = this.parsePageRange(pageSelection, totalPages);
                } else if (Array.isArray(pageSelection)) {
                    targetIndices = pageSelection
                        .map(p => p - 1)
                        .filter(idx => idx >= 0 && idx < totalPages);
                }

                if (targetIndices.length === 0) {
                    throw new Error('No valid pages selected for extraction.');
                }

                if (onProgress) onProgress(40, `Extracting ${targetIndices.length} page(s)...`);

                const extractedPdf = await PDFDocument.create();
                const copiedPages = await extractedPdf.copyPages(srcPdf, targetIndices);

                copiedPages.forEach(page => extractedPdf.addPage(page));

                if (onProgress) onProgress(80, 'Generating extracted PDF document...');

                const pdfBytes = await extractedPdf.save();

                if (this.lastExtractedUrl) {
                    URL.revokeObjectURL(this.lastExtractedUrl);
                }

                const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
                const pdfUrl = URL.createObjectURL(pdfBlob);

                this.lastExtractedBlob = pdfBlob;
                this.lastExtractedUrl = pdfUrl;

                if (onProgress) onProgress(100, 'Page extraction completed!');

                return {
                    blob: pdfBlob,
                    url: pdfUrl,
                    pageCount: targetIndices.length,
                    extractedIndices: targetIndices
                };

            } catch (error) {
                console.error('[PDFSplitUtility Extract Error]:', error);
                throw error;
            }
        }

        /**
         * Splits a PDF file into separate individual PDF files, one for each page.
         * @param {File|ArrayBuffer} file - Source PDF file input.
         * @param {Function} [onProgress] - Optional progress callback function.
         * @returns {Promise<Array<{ blob: Blob, url: string, pageNumber: number, fileName: string }>>}
         */
        async splitAllPages(file, onProgress = null) {
            try {
                if (!file) {
                    throw new Error('No PDF file provided for splitting.');
                }

                const { PDFDocument } = await this.ensurePDFLibLoaded();

                if (onProgress) onProgress(10, 'Loading source PDF for splitting...');

                let arrayBuffer;
                if (file instanceof File || file instanceof Blob) {
                    arrayBuffer = await file.arrayBuffer();
                } else if (file instanceof ArrayBuffer) {
                    arrayBuffer = file;
                } else {
                    throw new Error('Invalid file input. Expected File or ArrayBuffer.');
                }

                const srcPdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
                const totalPages = srcPdf.getPageCount();

                if (totalPages === 0) {
                    throw new Error('The PDF document contains no pages.');
                }

                const baseFileName = (file.name || 'document').replace(/\.pdf$/i, '');
                const splitResults = [];

                for (let i = 0; i < totalPages; i++) {
                    const percent = Math.round(10 + ((i + 1) / totalPages) * 80);
                    if (onProgress) {
                        onProgress(percent, `Splitting page ${i + 1} of ${totalPages}...`);
                    }

                    const singlePagePdf = await PDFDocument.create();
                    const [copiedPage] = await singlePagePdf.copyPages(srcPdf, [i]);
                    singlePagePdf.addPage(copiedPage);

                    const pdfBytes = await singlePagePdf.save();
                    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                    const url = URL.createObjectURL(blob);
                    const pageNumber = i + 1;
                    const fileName = `${baseFileName}_page_${pageNumber}.pdf`;

                    splitResults.push({ blob, url, pageNumber, fileName });
                }

                if (onProgress) onProgress(100, 'Split completed successfully!');

                return splitResults;

            } catch (error) {
                console.error('[PDFSplitUtility Split All Error]:', error);
                throw error;
            }
        }

        /**
         * Renders an interactive page selection preview grid into an HTML container.
         * @param {number} totalPages - Total page count to render thumbnails for.
         * @param {HTMLElement} containerElement - DOM container to place controls and thumbnails in.
         * @param {Function} [onSelectionChange] - Callback when selected pages change.
         */
        renderPagePreviewGrid(totalPages, containerElement, onSelectionChange = null) {
            try {
                if (!containerElement) {
                    throw new Error('Preview container element is required.');
                }

                containerElement.innerHTML = '';
                const selectedPages = new Set(Array.from({ length: totalPages }, (_, i) => i + 1));

                const gridContainer = document.createElement('div');
                gridContainer.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-[350px] overflow-y-auto p-2';

                for (let i = 1; i <= totalPages; i++) {
                    const pageNum = i;
                    const pageCard = document.createElement('div');
                    pageCard.className = 'relative aspect-[3/4] bg-white dark:bg-slate-800 rounded-xl border-2 border-blue-500 shadow-sm p-3 flex flex-col justify-between cursor-pointer transition-all hover:scale-105';
                    pageCard.dataset.page = pageNum;

                    pageCard.innerHTML = `
                        <div class="flex justify-between items-center text-[10px]">
                            <span class="font-bold text-slate-700 dark:text-slate-200">Page ${pageNum}</span>
                            <span class="material-symbols-outlined text-blue-500 text-sm check-icon">check_circle</span>
                        </div>
                        <div class="space-y-1.5 my-auto opacity-60">
                            <div class="h-1.5 bg-slate-200 dark:bg-slate-700 rounded w-full"></div>
                            <div class="h-1.5 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
                            <div class="h-1.5 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
                        </div>
                    `;

                    pageCard.addEventListener('click', () => {
                        const checkIcon = pageCard.querySelector('.check-icon');
                        if (selectedPages.has(pageNum)) {
                            selectedPages.delete(pageNum);
                            pageCard.classList.remove('border-blue-500', 'bg-white', 'dark:bg-slate-800');
                            pageCard.classList.add('border-slate-200', 'dark:border-slate-700', 'opacity-50');
                            if (checkIcon) checkIcon.textContent = 'radio_button_unchecked';
                        } else {
                            selectedPages.add(pageNum);
                            pageCard.classList.remove('border-slate-200', 'dark:border-slate-700', 'opacity-50');
                            pageCard.classList.add('border-blue-500', 'bg-white', 'dark:bg-slate-800');
                            if (checkIcon) checkIcon.textContent = 'check_circle';
                        }

                        if (onSelectionChange && typeof onSelectionChange === 'function') {
                            onSelectionChange(Array.from(selectedPages).sort((a, b) => a - b));
                        }
                    });

                    gridContainer.appendChild(pageCard);
                }

                containerElement.appendChild(gridContainer);
            } catch (error) {
                console.error('[PDFSplitUtility Preview Grid Error]:', error);
            }
        }

        /**
         * Triggers automatic download of a split or extracted PDF document.
         * @param {Blob|string} pdfInput - PDF Blob or Object URL.
         * @param {string} [filename='Split_Document_PDFMaster.pdf'] - Download file name.
         */
        downloadPDF(pdfInput, filename = 'Split_Document_PDFMaster.pdf') {
            try {
                let downloadUrl = '';
                let shouldRevoke = false;

                if (pdfInput instanceof Blob) {
                    downloadUrl = URL.createObjectURL(pdfInput);
                    shouldRevoke = true;
                } else if (typeof pdfInput === 'string' && pdfInput.length > 0) {
                    downloadUrl = pdfInput;
                } else if (this.lastExtractedUrl) {
                    downloadUrl = this.lastExtractedUrl;
                } else {
                    throw new Error('No PDF file available to download.');
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
                console.error('[PDFSplitUtility Download Error]:', error);
                throw error;
            }
        }
    }

    global.PDFSplitUtility = PDFSplitUtility;
    global.pdfSplitter = new PDFSplitUtility();

})(typeof window !== 'undefined' ? window : this);
