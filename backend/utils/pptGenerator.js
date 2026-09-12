const PptxGenJS = require("pptxgenjs");

function normalizeSlideContent(slide) {
  const content = Array.isArray(slide?.content) ? slide.content : [];
  return content.filter((entry) => typeof entry === "string" && entry.trim());
}

function formatFormulaForPowerPoint(formula) {
  let formatted = String(formula || '')
    .replace(/\$\$?|\\\[|\\\]/g, '')
    .replace(/\\left|\\right|\\displaystyle|\\,|\\;|\\!/g, '')
    .replace(/\\text\{([^{}]*)\}/g, '$1');

  const symbols = {
    '\\nabla': '∇',
    '\\partial': '∂',
    '\\psi': 'ψ',
    '\\phi': 'φ',
    '\\theta': 'θ',
    '\\lambda': 'λ',
    '\\alpha': 'α',
    '\\beta': 'β',
    '\\gamma': 'γ',
    '\\Delta': 'Δ',
    '\\Sigma': 'Σ',
    '\\infty': '∞',
    '\\times': '×',
    '\\cdot': '·',
    '\\pm': '±',
    '\\leq': '≤',
    '\\geq': '≥',
    '\\neq': '≠',
    '\\rightarrow': '→',
    '\\to': '→',
    '\\sqrt': '√',
  };

  Object.entries(symbols).forEach(([command, symbol]) => {
    formatted = formatted.replaceAll(command, symbol);
  });

  let previous;
  do {
    previous = formatted;
    formatted = formatted.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2');
  } while (formatted !== previous);

  const superscripts = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '=': '⁼', 'n': 'ⁿ' };
  formatted = formatted
    .replace(/\^\{([^{}]*)\}/g, (_, value) => [...value].map((character) => superscripts[character] || character).join(''))
    .replace(/\^([0-9n])/g, (_, value) => superscripts[value] || value)
    .replace(/_\{([^{}]*)\}/g, (_, value) => `_${value}`)
    .replace(/[{}]/g, '')
    .replace(/\\([a-zA-Z]+)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  return formatted;
}

function normalizePresentationFormulas(presentation) {
  return {
    ...presentation,
    slides: presentation.slides.map((slide) => ({
      ...slide,
      formula: slide.formula ? formatFormulaForPowerPoint(slide.formula) : slide.formula,
    })),
  };
}

function renderFormulaBlock(slide, ppt, formula, notes, palette) {
  if (!formula || !formula.trim()) return;
  const formattedFormula = formatFormulaForPowerPoint(formula);

  slide.addShape(ppt.ShapeType.roundRect, {
    x: 0.55,
    y: 1.05,
    w: 12.1,
    h: 2.35,
    rectRadius: 0.08,
    fill: { color: palette.soft },
    line: { color: palette.accent, width: 1.5 },
  });

  slide.addText("Formula", {
    x: 0.6,
    y: 1.2,
    w: 2.5,
    h: 0.5,
    fontFace: "Aptos",
    fontSize: 16,
    bold: true,
    color: palette.dark,
    margin: 0.05,
  });

  slide.addText(formattedFormula, {
    x: 0.8,
    y: 1.7,
    w: 11.8,
    h: 1.2,
    fontFace: "Cambria Math",
    fontSize: 26,
    bold: false,
    color: palette.dark,
    align: "center",
    margin: 0.08,
  });

  if (notes && notes.trim()) {
    const noteLines = notes.split(/\n+/).slice(0, 5);
    slide.addText(noteLines.join("\n"), {
      x: 0.8,
      y: 3.2,
      w: 11.8,
      h: 2.0,
      fontFace: "Aptos",
      fontSize: 14,
      color: "334155",
      margin: 0.08,
      bullet: { type: "bullet" },
    });
  }
}

function renderTable(slide, ppt, tableData, palette) {
  if (!Array.isArray(tableData) || tableData.length === 0) return;

  const rows = tableData.length;
  const cols = Math.max(...tableData.map((row) => Array.isArray(row) ? row.length : 0), 1);
  const tableWidth = 10.6;
  const tableHeight = Math.min(2.8, rows * 0.42 + 0.8);
  const x = 1.35;
  const y = 2.3;

  slide.addText("Comparison", {
    x: 0.6,
    y: 1.2,
    w: 2.5,
    h: 0.5,
    fontFace: "Aptos",
    fontSize: 16,
    bold: true,
    color: palette.dark,
  });

  slide.addTable(tableData, {
    x,
    y,
    w: tableWidth,
    h: tableHeight,
    border: { pt: 1, color: palette.accent },
    fill: { color: palette.white },
    fontFace: "Aptos",
    fontSize: 12,
    color: palette.dark,
    bold: false,
    margin: 0.08,
    valign: "middle",
    align: "center",
    rowH: 0.35,
    autoPage: false,
    color: "0F172A",
  });
}

function renderVisualSuggestion(slide, ppt, suggestion, palette) {
  if (!suggestion || !suggestion.trim()) return;

  const diagramX = 8.4;
  const diagramY = 1.7;
  const diagramW = 4.2;
  const diagramH = 3.5;

  slide.addShape(ppt.ShapeType.roundRect, {
    x: diagramX,
    y: diagramY,
    w: diagramW,
    h: diagramH,
    fill: { color: palette.soft },
    line: { color: palette.accent, width: 1.5 },
    radius: 0.08,
  });

  slide.addText("Diagram idea", {
    x: diagramX + 0.2,
    y: diagramY + 0.2,
    w: diagramW - 0.4,
    h: 0.35,
    fontFace: "Aptos",
    fontSize: 13,
    bold: true,
    color: palette.dark,
  });

  slide.addText(suggestion.trim().slice(0, 180), {
    x: diagramX + 0.25,
    y: diagramY + 0.7,
    w: diagramW - 0.5,
    h: 2.3,
    fontFace: "Aptos",
    fontSize: 12,
    color: "334155",
    margin: 0.08,
    valign: "top",
    bullet: { type: "none" },
  });
}

async function buildPptxBuffer(presentation, input) {
  const ppt = new PptxGenJS();
  const palettes = [
    { accent: "2563EB", soft: "DBEAFE", dark: "1E3A8A", white: "FFFFFF", background: "F8FAFC" },
    { accent: "0F766E", soft: "CCFBF1", dark: "134E4A", white: "FFFFFF", background: "F0FDFA" },
    { accent: "D97706", soft: "FEF3C7", dark: "78350F", white: "FFFFFF", background: "FFFBEB" },
    { accent: "DB2777", soft: "FCE7F3", dark: "831843", white: "FFFFFF", background: "FFF7FA" },
    { accent: "7C3AED", soft: "EDE9FE", dark: "4C1D95", white: "FFFFFF", background: "FAF5FF" },
  ];
  ppt.layout = "LAYOUT_WIDE";
  ppt.author = input.professorName || presentation.professorName;
  ppt.company = "MG AI PPT Generator";
  ppt.subject = input.chapterName || presentation.chapterName;
  ppt.title = presentation.presentationTitle || "AI Generated Presentation";
  ppt.theme = {
    colorScheme: {
      accent1: "0F172A",
      accent2: "2563EB",
      accent3: "10B981",
      accent4: "F59E0B",
      accent5: "EC4899",
      accent6: "7C3AED",
      text1: "0F172A",
      text2: "334155",
    },
    fontFace: "Aptos",
  };

  const allSlides = Array.isArray(presentation.slides) ? presentation.slides : [];

  allSlides.forEach((slide, index) => {
    const isTitleSlide = index === 0;
    const slideObj = ppt.addSlide();
    const palette = palettes[index % palettes.length];

    slideObj.background = { color: isTitleSlide ? palette.dark : palette.background };

    if (!isTitleSlide) {
      slideObj.addShape(ppt.ShapeType.rect, {
        x: 0,
        y: 0,
        w: 13.333,
        h: 0.16,
        fill: { color: palette.accent },
        line: { color: palette.accent },
      });
      slideObj.addShape(ppt.ShapeType.roundRect, {
        x: 11.65,
        y: 0.25,
        w: 1.05,
        h: 0.42,
        rectRadius: 0.08,
        fill: { color: palette.soft },
        line: { color: palette.accent, width: 1 },
      });
    }

    if (isTitleSlide) {
      slideObj.addText(presentation.presentationTitle || "AI Generated Presentation", {
        x: 0.7,
        y: 1.6,
        w: 12.0,
        h: 1.6,
        fontFace: "Aptos",
        fontSize: 28,
        bold: true,
        color: "FFFFFF",
        align: "center",
      });

      slideObj.addText((presentation.chapterName || input.chapterName || "Chapter").toUpperCase(), {
        x: 1.2,
        y: 3.0,
        w: 10.8,
        h: 0.5,
        fontFace: "Aptos",
        fontSize: 16,
        color: "DBEAFE",
        bold: true,
        align: "center",
      });

      slideObj.addText(`Presented by: ${input.professorName || presentation.professorName || "Professor"}`, {
        x: 2.2,
        y: 4.0,
        w: 8.8,
        h: 0.7,
        fontFace: "Aptos",
        fontSize: 20,
        color: "E2E8F0",
        align: "center",
      });

      slideObj.addText("MG AI PPT Generator", {
        x: 4.8,
        y: 6.2,
        w: 3.8,
        h: 0.4,
        fontFace: "Aptos",
        fontSize: 11,
        color: "CBD5E1",
        bold: false,
        align: "center",
      });

      return;
    }

    slideObj.addText(slide.title || `Slide ${slide.slideNumber || index + 1}`, {
      x: 0.6,
      y: 0.4,
      w: 10.0,
      h: 0.6,
      fontFace: "Aptos",
      fontSize: 22,
      bold: true,
      color: palette.dark,
      margin: 0.03,
    });

    slideObj.addText(`${input.chapterName || presentation.chapterName || "Chapter"} | ${input.professorName || presentation.professorName || "Professor"}`, {
      x: 0.7,
      y: 0.95,
      w: 7.5,
      h: 0.3,
      fontFace: "Aptos",
      fontSize: 10,
      color: "475569",
      italic: true,
    });

    slideObj.addText(`${slide.slideNumber || index + 1}/${allSlides.length}`, {
      x: 11.8,
      y: 0.35,
      w: 1.0,
      h: 0.3,
      fontFace: "Aptos",
      fontSize: 10,
      color: palette.dark,
      align: "right",
    });

    const subtitle = slide.subtitle || "";
    if (subtitle.trim()) {
      slideObj.addText(subtitle, {
        x: 0.7,
        y: 1.35,
        w: 11.0,
        h: 0.4,
        fontFace: "Aptos",
        fontSize: 12,
        color: "475569",
      });
    }

    if (slide.formula && slide.formula.trim()) {
      renderFormulaBlock(slideObj, ppt, slide.formula, slide.speakerNotes || "", palette);
      const bulletPoints = normalizeSlideContent(slide);
      if (bulletPoints.length) {
        slideObj.addText(bulletPoints.slice(0, 4).map((line) => `• ${line}`).join("\n"), {
          x: 0.8,
          y: 4.7,
          w: 11.4,
          h: 1.8,
          fontFace: "Aptos",
          fontSize: 16,
          color: "0F172A",
          margin: 0.06,
          breakLine: true,
        });
      }
    } else if (slide.table && Array.isArray(slide.table)) {
      const bulletPoints = normalizeSlideContent(slide);
      if (bulletPoints.length) {
        slideObj.addText(bulletPoints.slice(0, 4).map((line) => `• ${line}`).join("\n"), {
          x: 0.8,
          y: 1.9,
          w: 4.9,
          h: 2.6,
          fontFace: "Aptos",
          fontSize: 14,
          color: "0F172A",
          margin: 0.06,
          breakLine: true,
        });
      }
      renderTable(slideObj, ppt, slide.table, palette);
    } else {
      const bulletPoints = normalizeSlideContent(slide);
      if (bulletPoints.length > 0) {
        const lines = bulletPoints.slice(0, 7).map((line) => `• ${line}`);
        const textBlockX = 0.8;
        const textBlockY = 1.7;
        const textBlockW = 11.4;
        const textBlockH = 4.8;

        if (bulletPoints.length > 4) {
          slideObj.addText(lines.slice(0, 4).join("\n"), {
            x: textBlockX,
            y: textBlockY,
            w: 5.3,
            h: textBlockH,
            fontFace: "Aptos",
            fontSize: 15,
            color: "0F172A",
            margin: 0.08,
            breakLine: true,
            bullet: { type: "none" },
          });

          slideObj.addText(lines.slice(4).join("\n"), {
            x: 6.3,
            y: textBlockY,
            w: 5.7,
            h: textBlockH,
            fontFace: "Aptos",
            fontSize: 15,
            color: "0F172A",
            margin: 0.08,
            breakLine: true,
            bullet: { type: "none" },
          });
        } else {
          slideObj.addText(lines.join("\n"), {
            x: textBlockX,
            y: textBlockY,
            w: textBlockW,
            h: textBlockH,
            fontFace: "Aptos",
            fontSize: 16,
            color: "0F172A",
            margin: 0.08,
            breakLine: true,
            bullet: { type: "none" },
          });
        }
      }
    }

    const notes = slide.speakerNotes || "";
    if (notes.trim()) {
      slideObj.addText(`Speaker notes: ${notes.trim().slice(0, 200)}`, {
        x: 0.8,
        y: 6.6,
        w: 11.4,
        h: 0.45,
        fontFace: "Aptos",
        fontSize: 8,
        color: "64748B",
        italic: true,
      });
    }

    slideObj.addText(`Chapter ${input.chapterName || presentation.chapterName || "Chapter"} | ${input.professorName || presentation.professorName || "Professor"}`, {
      x: 0.7,
      y: 7.0,
      w: 11.8,
      h: 0.3,
      fontFace: "Aptos",
      fontSize: 9,
      color: "64748B",
      align: "center",
    });
  });

  return ppt.write({ outputType: "nodebuffer" });
}

module.exports = {
  buildPptxBuffer,
  normalizePresentationFormulas,
};
