const clients = new Set();

const addClient = (response) => {
    clients.add(response);
    response.write('retry: 3000\n\n');
    return () => clients.delete(response);
};

const broadcast = (event) => {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const response of clients) response.write(payload);
};

module.exports = { addClient, broadcast };