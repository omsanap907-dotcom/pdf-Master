async function mergePDFs(files) {

    const { PDFDocument } = PDFLib;

    const mergedPdf = await PDFDocument.create();

    for (const file of files) {

        const bytes = await file.arrayBuffer();

        const pdf = await PDFDocument.load(bytes);

        const copiedPages = await mergedPdf.copyPages(
            pdf,
            pdf.getPageIndices()
        );

        copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedBytes = await mergedPdf.save();

    downloadPDF(mergedBytes, "merged.pdf");

}

function downloadPDF(bytes, filename) {

    const blob = new Blob([bytes], {
        type: "application/pdf",
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;

    a.download = filename;

    a.click();

    URL.revokeObjectURL(url);

}
