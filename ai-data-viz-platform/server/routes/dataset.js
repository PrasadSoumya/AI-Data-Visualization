const express = require('express');
const multer = require('multer');
const fs = require('fs');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const path = require('path');

const router = express.Router();

// Multer Config
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../uploads/'));
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Helper to determine primitive types
const determineType = (val) => {
    if (!isNaN(parseFloat(val)) && isFinite(val)) return 'number';
    if (val === 'true' || val === 'false' || val === true || val === false) return 'boolean';
    return 'string';
};

// Route to handle dataset uploads
router.post('/upload', upload.single('dataset'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Please upload a CSV or Excel file.' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const filePath = req.file.path;
    let columns = [];
    let sampleData = [];
    let types = {};

    if (ext === '.csv') {
        let rowCount = 0;
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('headers', (headers) => {
                columns = headers;
            })
            .on('data', (data) => {
                if (rowCount < 5) {
                    sampleData.push(data);
                    
                    // Identify types on the first row
                    if (rowCount === 0) {
                        columns.forEach(col => {
                            types[col] = determineType(data[col]);
                        });
                    }
                }
                rowCount++;
            })
            .on('end', () => {
                res.json({
                    message: 'File processed successfully',
                    filename: req.file.filename,
                    columns,
                    types,
                    sampleData,
                    totalRows: rowCount
                });
            })
            .on('error', (err) => {
                res.status(500).json({ error: 'Error processing CSV file.' });
            });

    } else if (ext === '.xlsx' || ext === '.xls') {
        try {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(sheet);
            
            if (data.length > 0) {
                columns = Object.keys(data[0]);
                sampleData = data.slice(0, 5);
                
                columns.forEach(col => {
                    types[col] = determineType(sampleData[0][col]);
                });
            }

            res.json({
                message: 'File processed successfully',
                filename: req.file.filename,
                columns,
                types,
                sampleData,
                totalRows: data.length
            });
        } catch (error) {
            res.status(500).json({ error: 'Error processing Excel file.' });
        }
    } else {
        // Delete incorrect file format to save space
        fs.unlinkSync(filePath);
        return res.status(400).json({ error: 'Unsupported file format. Use .csv or .xlsx' });
    }
});

module.exports = router;
