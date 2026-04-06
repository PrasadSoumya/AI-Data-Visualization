const datasetCache = new Map();
const MAX_DATASETS = 20;

const trimCache = () => {
    while (datasetCache.size > MAX_DATASETS) {
        const oldestKey = datasetCache.keys().next().value;
        datasetCache.delete(oldestKey);
    }
};

const saveDataset = (datasetId, payload) => {
    datasetCache.set(datasetId, {
        ...payload,
        createdAt: new Date().toISOString()
    });
    trimCache();
};

const getDataset = (datasetId) => datasetCache.get(datasetId);

module.exports = {
    saveDataset,
    getDataset
};
