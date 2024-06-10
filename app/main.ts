import * as net from 'net';

const server = net.createServer((socket) => {
    const httpVersion = '1.1';
    const statusCode = 200;
    const statusReason = 'OK';
    const headers = "";
    const body = "";
    socket.write(`HTTP/${httpVersion} ${statusCode} ${statusReason}\r\n${headers}\r\n${body}`);
    socket.end();
});

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

// Uncomment this to pass the first stage
server.listen(4221, 'localhost', () => {
    console.log('Server is running on port 4221');
});
