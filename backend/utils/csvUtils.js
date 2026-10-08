const fs = require('fs');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');

const readCsv = (filePath) => {
    return new Promise((resolve, reject) => {
        const results = [];
        if (!fs.existsSync(filePath)) {
            return resolve(results);
        }
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (err) => reject(err));
    });
};

const writeCsv = async (filePath, data, headers) => {
    const csvWriter = createObjectCsvWriter({
        path: filePath,
        header: headers
    });
    await csvWriter.writeRecords(data);
};

module.exports = { readCsv, writeCsv };

