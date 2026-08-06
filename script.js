document.addEventListener("DOMContentLoaded", () => {
    console.log("PDF Master Started");

    const mergeBtn = document.getElementById("mergeBtn");

    if (mergeBtn) {
        mergeBtn.addEventListener("click", openMergeTool);
    }
});

function openMergeTool() {

    const input = document.createElement("input");

    input.type = "file";

    input.accept = ".pdf";

    input.multiple = true;

    input.onchange = async (e) => {

        const files = [...e.target.files];

        if (files.length < 2) {
            alert("Select at least two PDFs");
            return;
        }

        await mergePDFs(files);

    };

    input.click();

}
