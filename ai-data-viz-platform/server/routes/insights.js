const express = require('express');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getDataset } = require('../lib/datasetStore');

const router = express.Router();

const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

const gemini = process.env.GEMINI_API_KEY
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;

const toNumber = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;

    const cleaned = value.replace(/,/g, '').trim();
    if (!cleaned) return null;

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
};

const normalizeText = (value) => String(value || '').toLowerCase();

const tokenize = (value) =>
    normalizeText(value)
        .split(/[^a-z0-9_]+/)
        .filter((token) => token.length > 1);

const chooseChart = (query, availableCharts = []) => {
    const q = normalizeText(query);
    let preferredType = 'bar';

    if (q.includes('trend') || q.includes('time') || q.includes('growth')) preferredType = 'line';
    else if (q.includes('area') || q.includes('volume')) preferredType = 'area';
    else if (q.includes('share') || q.includes('percentage') || q.includes('distribution') || q.includes('pie')) preferredType = 'pie';

    return availableCharts.find((chart) => chart.chartType === preferredType) || availableCharts[0] || null;
};

const scoreRowAgainstQuery = (row, queryTokens) => {
    const rowText = normalizeText(Object.values(row).join(' '));
    return queryTokens.reduce((score, token) => score + (rowText.includes(token) ? 1 : 0), 0);
};

const getRelevantRows = (rows, query) => {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return rows.slice(0, 8);

    return rows
        .map((row) => ({ row, score: scoreRowAgainstQuery(row, queryTokens) }))
        .sort((a, b) => b.score - a.score)
        .filter((item) => item.score > 0)
        .slice(0, 8)
        .map((item) => item.row);
};

const getMentionedColumns = (query, columns = []) => {
    const q = normalizeText(query);
    return columns.filter((column) => q.includes(normalizeText(column)));
};

const buildSchemaSummary = (summary) => {
    const entries = Object.entries(summary.types || {}).map(([column, type]) => `${column}: ${type}`);
    return entries.join(', ');
};

const buildNumericSummaryText = (numericSummaries = {}) =>
    Object.entries(numericSummaries)
        .slice(0, 6)
        .map(([column, stats]) => `${column} => min ${stats.min}, max ${stats.max}, avg ${stats.average}, total ${stats.total}`)
        .join('\n');

const buildCategorySummaryText = (categoricalSummaries = {}) =>
    Object.entries(categoricalSummaries)
        .slice(0, 4)
        .map(([column, values]) => {
            const topValues = values
                .slice(0, 4)
                .map((value) => `${value.label} (${value.count} rows)`)
                .join(', ');
            return `${column} => ${topValues}`;
        })
        .join('\n');

const buildLocalInsight = (query, dataset, suggestedChart) => {
    const summary = dataset.summary;
    const columns = summary.columns || [];
    const numericSummaries = summary.numericSummaries || {};
    const mentionedColumns = getMentionedColumns(query, columns);
    const primaryMetric = summary.visualizations?.primaryMetric;
    const metricStats = primaryMetric ? numericSummaries[primaryMetric] : null;

    let insight = `I answered this from the uploaded dataset context. `;

    if (mentionedColumns.length > 0) {
        insight += `Your question maps most closely to these columns: ${mentionedColumns.join(', ')}. `;
    } else {
        insight += `The strongest columns for this question appear to be ${columns.slice(0, 4).join(', ')}. `;
    }

    if (metricStats && /highest|max|top|largest/.test(normalizeText(query))) {
        insight += `The main numeric metric '${primaryMetric}' ranges from ${metricStats.min} to ${metricStats.max}, with an average of ${metricStats.average}. `;
    } else if (metricStats && /average|mean|summary|overview/.test(normalizeText(query))) {
        insight += `For '${primaryMetric}', the dataset average is ${metricStats.average}, total is ${metricStats.total}, and values span ${metricStats.min} to ${metricStats.max}. `;
    } else {
        insight += `This answer is grounded in the dataset schema, summaries, and the most relevant rows rather than a generic response. `;
    }

    if (!openai && !gemini) {
        insight += `Add GEMINI_API_KEY or OPENAI_API_KEY on the server to upgrade this into fuller natural-language dataset Q&A.`;
    }

    return {
        insight,
        suggestedChart: suggestedChart?.chartType || 'bar',
        suggestedXAxis: suggestedChart?.xAxis || summary.visualizations?.primaryCategory || columns[0],
        suggestedYAxis: suggestedChart?.yAxis || summary.visualizations?.primaryMetric || columns[1] || columns[0],
        chartData: suggestedChart?.data || [],
        chartSeries: suggestedChart?.series || (suggestedChart?.yAxis ? [suggestedChart.yAxis] : [])
    };
};

const buildPrompt = (query, dataset, relevantRows) => {
    const summary = dataset.summary;

    return `
You are a data analyst answering questions strictly about one uploaded dataset.

Rules:
- Answer only from the provided dataset context.
- If the question cannot be answered fully from the available context, say what is missing.
- Be concise but useful.
- Mention specific columns when relevant.
- Do not invent values.

Dataset file: ${summary.filename}
Total rows: ${summary.totalRows}
Columns and inferred types:
${buildSchemaSummary(summary)}

Numeric summaries:
${buildNumericSummaryText(summary.numericSummaries)}

Categorical summaries:
${buildCategorySummaryText(summary.categoricalSummaries)}

Preview rows:
${JSON.stringify(summary.previewData || [], null, 2)}

Relevant rows for the user question:
${JSON.stringify(relevantRows, null, 2)}

User question:
${query}
    `.trim();
};

const askOpenAI = async (query, dataset, suggestedChart) => {
    const relevantRows = getRelevantRows(dataset.rows || [], query);
    const prompt = buildPrompt(query, dataset, relevantRows);

    const response = await openai.responses.create({
        model: process.env.OPENAI_MODEL || 'gpt-5.2',
        input: prompt
    });

    return {
        insight: response.output_text || 'No answer returned by the model.',
        suggestedChart: suggestedChart?.chartType || 'bar',
        suggestedXAxis: suggestedChart?.xAxis || dataset.summary.visualizations?.primaryCategory || dataset.summary.columns[0],
        suggestedYAxis: suggestedChart?.yAxis || dataset.summary.visualizations?.primaryMetric || dataset.summary.columns[1] || dataset.summary.columns[0],
        chartData: suggestedChart?.data || [],
        chartSeries: suggestedChart?.series || (suggestedChart?.yAxis ? [suggestedChart.yAxis] : [])
    };
};

const askGemini = async (query, dataset, suggestedChart) => {
    const relevantRows = getRelevantRows(dataset.rows || [], query);
    const prompt = buildPrompt(query, dataset, relevantRows);
    const model = gemini.getGenerativeModel({
        model: process.env.GEMINI_MODEL || 'gemini-1.5-flash'
    });

    const result = await model.generateContent(prompt);
    const insight = result.response?.text?.() || 'No answer returned by the model.';

    return {
        insight,
        suggestedChart: suggestedChart?.chartType || 'bar',
        suggestedXAxis: suggestedChart?.xAxis || dataset.summary.visualizations?.primaryCategory || dataset.summary.columns[0],
        suggestedYAxis: suggestedChart?.yAxis || dataset.summary.visualizations?.primaryMetric || dataset.summary.columns[1] || dataset.summary.columns[0],
        chartData: suggestedChart?.data || [],
        chartSeries: suggestedChart?.series || (suggestedChart?.yAxis ? [suggestedChart.yAxis] : [])
    };
};

router.post('/ask', async (req, res) => {
    try {
        const { query, datasetId, datasetSummary } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Missing user query.' });
        }

        const dataset = datasetId ? getDataset(datasetId) : null;

        if (!dataset && !datasetSummary) {
            return res.status(400).json({ error: 'Missing dataset context.' });
        }

        const fallbackDataset = dataset || {
            rows: datasetSummary.previewData || datasetSummary.sampleData || [],
            summary: datasetSummary
        };

        const availableCharts = fallbackDataset.summary.visualizations?.charts || [];
        const suggestedChart = chooseChart(query, availableCharts);

        if (!openai && !gemini) {
            return res.json(buildLocalInsight(query, fallbackDataset, suggestedChart));
        }

        try {
            const aiResponse = openai
                ? await askOpenAI(query, fallbackDataset, suggestedChart)
                : await askGemini(query, fallbackDataset, suggestedChart);
            return res.json(aiResponse);
        } catch (modelError) {
            console.error('Model dataset QA failed, falling back locally:', modelError.message);
            return res.json(buildLocalInsight(query, fallbackDataset, suggestedChart));
        }
    } catch (error) {
        console.error('AI Insight Error:', error);
        return res.status(500).json({ error: 'Failed to generate insight: ' + error.message });
    }
});

module.exports = router;
