const express = require('express');
const multer = require('multer');
const fs = require('fs');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const path = require('path');
const { randomUUID } = require('crypto');
const { saveDataset } = require('../lib/datasetStore');

const router = express.Router();
const uploadDir = path.join(__dirname, '../uploads/');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage });

const PREVIEW_ROW_LIMIT = 12;
const MAX_CATEGORY_BUCKETS = 8;
const MAX_TREND_POINTS = 20;

const toNumber = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;

    const cleaned = value.replace(/,/g, '').trim();
    if (!cleaned) return null;

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
};

const toBoolean = (value) => {
    if (value === true || value === false) return value;
    if (typeof value !== 'string') return null;

    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return null;
};

const toDateValue = (value) => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value !== 'string' && typeof value !== 'number') return null;

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeCell = (value) => {
    if (value === undefined || value === null) return '';
    return String(value).trim();
};

const inferColumnType = (rows, column) => {
    const values = rows
        .map((row) => row[column])
        .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
        .slice(0, 100);

    if (values.length === 0) return 'string';

    let numericCount = 0;
    let booleanCount = 0;
    let dateCount = 0;

    values.forEach((value) => {
        if (toNumber(value) !== null) numericCount += 1;
        if (toBoolean(value) !== null) booleanCount += 1;
        if (toDateValue(value) !== null) dateCount += 1;
    });

    if (numericCount / values.length >= 0.8) return 'number';
    if (booleanCount === values.length) return 'boolean';
    if (dateCount / values.length >= 0.8) return 'date';
    return 'string';
};

const buildNumericSummaries = (rows, numericColumns) => {
    const summaries = {};

    numericColumns.forEach((column) => {
        const values = rows
            .map((row) => toNumber(row[column]))
            .filter((value) => value !== null);

        if (values.length === 0) return;

        const sum = values.reduce((acc, value) => acc + value, 0);
        summaries[column] = {
            min: Math.min(...values),
            max: Math.max(...values),
            average: Number((sum / values.length).toFixed(2)),
            total: Number(sum.toFixed(2))
        };
    });

    return summaries;
};

const buildCategoricalSummaries = (rows, categoricalColumns, numericColumns) => {
    const summaries = {};
    const primaryMetric = numericColumns[0];

    categoricalColumns.forEach((column) => {
        const buckets = new Map();

        rows.forEach((row) => {
            const key = normalizeCell(row[column]) || 'Unknown';
            const current = buckets.get(key) || { label: key, count: 0, total: 0 };
            current.count += 1;

            if (primaryMetric) {
                const metricValue = toNumber(row[primaryMetric]);
                if (metricValue !== null) current.total += metricValue;
            }

            buckets.set(key, current);
        });

        summaries[column] = Array.from(buckets.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, MAX_CATEGORY_BUCKETS)
            .map((item) => ({
                label: item.label,
                count: item.count,
                total: Number(item.total.toFixed(2))
            }));
    });

    return summaries;
};

const buildCategoryAggregateData = (rows, categoryColumn, metricColumn) => {
    const aggregates = new Map();

    rows.forEach((row) => {
        const category = normalizeCell(row[categoryColumn]) || 'Unknown';
        const metricValue = toNumber(row[metricColumn]);
        if (metricValue === null) return;

        const current = aggregates.get(category) || { [categoryColumn]: category, [metricColumn]: 0, count: 0 };
        current[metricColumn] += metricValue;
        current.count += 1;
        aggregates.set(category, current);
    });

    return Array.from(aggregates.values())
        .sort((a, b) => b[metricColumn] - a[metricColumn])
        .slice(0, MAX_CATEGORY_BUCKETS)
        .map((item) => ({
            ...item,
            [metricColumn]: Number(item[metricColumn].toFixed(2))
        }));
};

const buildTrendData = (rows, labelColumn, metricColumns, labelType) => {
    const cleanedRows = rows
        .map((row, index) => {
            const base = {
                rowNumber: index + 1,
                label: labelType === 'date'
                    ? toDateValue(row[labelColumn])?.toISOString().slice(0, 10)
                    : normalizeCell(row[labelColumn]) || `Row ${index + 1}`
            };

            metricColumns.forEach((column) => {
                const value = toNumber(row[column]);
                base[column] = value === null ? 0 : value;
            });

            return base;
        })
        .slice(0, MAX_TREND_POINTS);

    if (labelType === 'date') {
        cleanedRows.sort((a, b) => new Date(a.label) - new Date(b.label));
    }

    return cleanedRows;
};

const buildDistributionData = (rows, metricColumn) => {
    const values = rows
        .map((row) => toNumber(row[metricColumn]))
        .filter((value) => value !== null);

    if (values.length < 2) return [];

    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) {
        return [{ range: `${min}`, count: values.length }];
    }

    const bucketCount = Math.min(6, values.length);
    const bucketSize = (max - min) / bucketCount;
    const buckets = Array.from({ length: bucketCount }, (_, index) => {
        const start = min + index * bucketSize;
        const end = index === bucketCount - 1 ? max : start + bucketSize;
        return {
            range: `${start.toFixed(1)}-${end.toFixed(1)}`,
            count: 0
        };
    });

    values.forEach((value) => {
        const rawIndex = Math.floor((value - min) / bucketSize);
        const bucketIndex = Math.min(rawIndex, bucketCount - 1);
        buckets[bucketIndex].count += 1;
    });

    return buckets;
};

const buildVisualizations = (rows, columns, types) => {
    const numericColumns = columns.filter((column) => types[column] === 'number');
    const categoricalColumns = columns.filter((column) => ['string', 'boolean'].includes(types[column]));
    const dateColumns = columns.filter((column) => types[column] === 'date');

    const primaryMetric = numericColumns[0];
    const secondaryMetric = numericColumns[1];
    const primaryCategory = dateColumns[0] || categoricalColumns[0];

    const charts = [];

    if (primaryCategory && primaryMetric) {
        const categoryData = buildCategoryAggregateData(rows, primaryCategory, primaryMetric);

        if (categoryData.length > 0) {
            charts.push({
                id: 'category-bar',
                title: `${primaryMetric} by ${primaryCategory}`,
                description: `Compare the strongest ${MAX_CATEGORY_BUCKETS} ${primaryCategory} groups by total ${primaryMetric}.`,
                chartType: 'bar',
                xAxis: primaryCategory,
                yAxis: primaryMetric,
                data: categoryData
            });

            charts.push({
                id: 'category-pie',
                title: `${primaryMetric} share across ${primaryCategory}`,
                description: `See how the total ${primaryMetric} is distributed across the leading ${primaryCategory} groups.`,
                chartType: 'pie',
                xAxis: primaryCategory,
                yAxis: primaryMetric,
                data: categoryData
            });
        }
    }

    if (primaryMetric) {
        const trendLabelColumn = dateColumns[0] || primaryCategory || columns[0];
        const trendLabelType = types[trendLabelColumn] || 'string';
        const trendMetrics = secondaryMetric ? [primaryMetric, secondaryMetric] : [primaryMetric];
        const trendData = buildTrendData(rows, trendLabelColumn, trendMetrics, trendLabelType);

        if (trendData.length > 0) {
            charts.push({
                id: 'trend-line',
                title: `${trendMetrics.join(' vs ')} trend`,
                description: `Track how the main numeric values move across ${trendLabelColumn}.`,
                chartType: 'line',
                xAxis: 'label',
                yAxis: primaryMetric,
                series: trendMetrics,
                data: trendData
            });

            charts.push({
                id: 'trend-area',
                title: `${primaryMetric} intensity`,
                description: `Area view of ${primaryMetric} across ${trendLabelColumn} to highlight rises and dips.`,
                chartType: 'area',
                xAxis: 'label',
                yAxis: primaryMetric,
                series: [primaryMetric],
                data: trendData
            });
        }

        const distributionData = buildDistributionData(rows, primaryMetric);
        if (distributionData.length > 0) {
            charts.push({
                id: 'distribution-bar',
                title: `${primaryMetric} distribution`,
                description: `Grouped frequency view showing where most ${primaryMetric} values sit.`,
                chartType: 'bar',
                xAxis: 'range',
                yAxis: 'count',
                data: distributionData
            });
        }
    }

    return {
        primaryMetric,
        secondaryMetric,
        primaryCategory,
        charts
    };
};

const buildDatasetPayload = (datasetId, rows, filename) => {
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    const normalizedRows = rows.map((row) => {
        const normalized = {};
        columns.forEach((column) => {
            normalized[column] = row[column];
        });
        return normalized;
    });

    const types = {};
    columns.forEach((column) => {
        types[column] = inferColumnType(normalizedRows, column);
    });

    const numericColumns = columns.filter((column) => types[column] === 'number');
    const categoricalColumns = columns.filter((column) => ['string', 'boolean', 'date'].includes(types[column]));

    return {
        datasetId,
        message: 'File processed successfully',
        filename,
        columns,
        types,
        totalRows: normalizedRows.length,
        previewData: normalizedRows.slice(0, PREVIEW_ROW_LIMIT),
        sampleData: normalizedRows.slice(0, 5),
        numericSummaries: buildNumericSummaries(normalizedRows, numericColumns),
        categoricalSummaries: buildCategoricalSummaries(normalizedRows, categoricalColumns, numericColumns),
        visualizations: buildVisualizations(normalizedRows, columns, types)
    };
};

const parseCsvFile = (filePath) => new Promise((resolve, reject) => {
    const rows = [];

    fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => rows.push(data))
        .on('end', () => resolve(rows))
        .on('error', reject);
});

router.post('/upload', upload.single('dataset'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Please upload a CSV or Excel file.' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const filePath = req.file.path;

    try {
        let rows = [];
        const datasetId = randomUUID();

        if (ext === '.csv') {
            rows = await parseCsvFile(filePath);
        } else if (ext === '.xlsx' || ext === '.xls') {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
        } else {
            fs.unlinkSync(filePath);
            return res.status(400).json({ error: 'Unsupported file format. Use .csv or .xlsx' });
        }

        const payload = buildDatasetPayload(datasetId, rows, req.file.filename);

        saveDataset(datasetId, {
            filename: req.file.filename,
            rows,
            summary: payload
        });

        return res.json(payload);
    } catch (error) {
        console.error('Dataset processing error:', error);
        return res.status(500).json({ error: 'Error processing uploaded file.' });
    }
});

module.exports = router;
