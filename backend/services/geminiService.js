const { GoogleGenAI } = require("@google/genai");

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("GEMINI_API_KEY is not set. Gemini features will fail until it is configured.");
}

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

function cleanGeminiResponse(rawText) {
  if (!rawText) return "";
  let cleaned = rawText.trim();

  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  return cleaned;
}

function extractGeminiText(response) {
  if (!response) return "";

  if (typeof response.text === "string" && response.text.trim()) {
    return response.text;
  }

  if (Array.isArray(response.candidates)) {
    const candidateText = response.candidates
      .map((candidate) => {
        const parts = candidate?.content?.parts || [];
        return parts.map((part) => part?.text || "").join("\n");
      })
      .join("\n");

    if (candidateText.trim()) {
      return candidateText;
    }
  }

  if (response?.output_text) {
    return response.output_text;
  }

  return "";
}

function validatePresentationData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid presentation structure received from Gemini.");
  }

  if (!data.presentationTitle || !String(data.presentationTitle).trim()) {
    throw new Error("Presentation title is missing from Gemini response.");
  }

  if (!data.chapterName || !String(data.chapterName).trim()) {
    throw new Error("Chapter name is missing from Gemini response.");
  }

  if (!data.professorName || !String(data.professorName).trim()) {
    throw new Error("Professor name is missing from Gemini response.");
  }

  if (!Array.isArray(data.slides) || data.slides.length === 0) {
    throw new Error("No presentation slides were returned by Gemini.");
  }

  data.slides.forEach((slide, index) => {
    if (!slide || typeof slide !== "object") {
      throw new Error(`Slide ${index + 1} is invalid.`);
    }

    if (!slide.title || !String(slide.title).trim()) {
      throw new Error(`Slide ${index + 1} title is missing.`);
    }

    if (!Array.isArray(slide.content)) {
      throw new Error(`Slide ${index + 1} content must be an array.`);
    }
  });

  return data;
}

async function generatePresentationFromGemini({
  professorName,
  chapterName,
  topicDetails,
  slideCount,
  style,
}) {
  if (!ai) {
    throw new Error("Gemini API key is missing. Please configure GEMINI_API_KEY in the server environment.");
  }

  const prompt = `You are an expert educational presentation designer and subject-matter educator.

Create a complete PowerPoint presentation based ONLY on the information provided by the user.

Professor:
${professorName}

Chapter:
${chapterName}

Topic Details:
${topicDetails}

Requested number of slides:
${slideCount}

Presentation style:
${style}

Create a logical, accurate and educational presentation.

Requirements:
1. Create a title slide.
2. Include the chapter name prominently.
3. Include professor name on the title slide.
4. Create a suitable introduction.
5. Divide the supplied topic into logical sections.
6. Explain important concepts clearly.
7. Include important definitions.
8. Include formulas where relevant.
9. Explain formulas and variables.
10. Include suitable examples where useful.
11. Include comparison tables where appropriate.
12. Include important points or key takeaways.
13. Include a conclusion.
14. Include a final 'Thank You' slide.
15. Do not invent unrelated topics.
16. Do not omit important topics supplied by the user.
17. Keep slide content concise enough to fit on a PowerPoint slide.
18. Use educational language suitable for college/university students.
19. Maintain consistent terminology.
20. Make the presentation visually structured.

For every slide provide:
- slide number
- slide title
- subtitle if needed
- bullet points
- detailed speaker notes
- formulas if required
- examples if required
- suggested visual/diagram description if useful
- table data if required

Return ONLY valid JSON.

JSON structure:
{
  "presentationTitle": "...",
  "professorName": "...",
  "chapterName": "...",
  "slides": [
    {
      "slideNumber": 1,
      "title": "...",
      "subtitle": "...",
      "content": [
        "..."
      ],
      "speakerNotes": "...",
      "formula": "",
      "visualSuggestion": "",
      "table": null
    }
  ]
}

Notes:
- Use realistic educational content.
- Keep each slide concise and readable.
- Ensure the number of slides matches the requested count as closely as possible.
- For formula fields, use one single-line LaTeX expression only. Use supported commands such as \\frac, \\sqrt, \\partial, \\nabla, Greek-letter commands, ^ for superscripts, and _ for subscripts. Do not include Markdown fences, prose, or multiple equations in one formula field.
- Keep the JSON valid and parseable without markdown fences or explanatory text.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: prompt,
  });

  const rawText = extractGeminiText(response);
  const cleanedText = cleanGeminiResponse(rawText);

  if (!cleanedText) {
    throw new Error("Gemini returned an empty response.");
  }

  let parsed;

  try {
    parsed = JSON.parse(cleanedText);
  } catch (error) {
    throw new Error("Gemini returned malformed JSON.");
  }

  return validatePresentationData(parsed);
}

module.exports = {
  generatePresentationFromGemini,
};
