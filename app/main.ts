import * as net from 'net';
import Bun from 'bun';
import path from 'path';

const statusTextByCode: {
    [code: number]: string;
} = {
    200: 'OK',
    404: 'Not Found',
};
const commonHeaders = {
    CONTENT_TYPE: 'Content-Type',
    CONTENT_LENGTH: 'Content-Length',
} as const;

const tmpDir = process.argv.find((arg, i, args) => args[i - 1] === '--directory') || './tmp';

type Handler = (req: Request) => PromiseLike<Response> | Response;

const handler: Handler = async (req: Request) => {
    console.log('req.method', req.method, 'req.url', req.url);
    if (req.method !== "GET") {
        return new Response("", { status: 405 });
    }
    const url = new URL(req.url);
    // curl -v http://localhost:4221/
    if (url.pathname === "/") {
        return new Response("", { status: 200 });
    }
    // curl -v http://localhost:4221/echo/abcdefg
    if (url.pathname.startsWith("/echo/")) {
        const text = url.pathname.slice("/echo/".length);
        return new Response(text, {
            status: 200,
        });
    }
    // curl -v --header "User-Agent: foobar/1.2.3" http://localhost:4221/user-agent
    if (url.pathname === "/user-agent") {
        const userAgent = req.headers.get("User-Agent");
        return new Response(userAgent || "", {
            status: 200,
        });
    }
    // echo -n 'Hello, World!' > /tmp/foo
    // curl -i http://localhost:4221/files/foo
    // curl -i http://localhost:4221/files/non_existant_file
    if (url.pathname.startsWith("/files/")) {
        const filename = url.pathname.slice("/files/".length);
        if (filename.includes("/") || filename.includes("\\")) {
            return new Response("", { status: 404 });
        }
        const file = Bun.file(path.resolve(tmpDir, filename));
        if (!await file.exists()) {
            return new Response("", { status: 404 });
        }
        const body = await file.text();
        return new Response(body, {
            status: 200,
        });

    }
    // curl -v http://localhost:4221/404
    return new Response("", { status: 404 });
};

const server = net.createServer(async (socket) => {
    console.log('got connection from', socket.remoteAddress, socket.remotePort);
    const lines = await new Promise<string[]>((resolve) => {
        let data = "";
        let cursor = 0;
        const lines: string[] = [];
        socket.on('data', (chunk) => {
            // chunk = "GET /abcdefg HTTP/1.1\r\nHost: localhost:4221\r\nUser-Agent: curl/7.84.0\r\nAccept: */*\r\n\r\n"
            data += chunk.toString();
            while (cursor < data.length) {
                const end = data.indexOf('\r\n', cursor);
                if (end === -1) {
                    break;
                }
                const line = data.slice(cursor, end);
                lines.push(line);
                cursor = end + 2;
                if (line === '') {
                    resolve(lines);
                }
            }
        });
    });
    const head = lines[0];
    const [method, requestPath, httpVersion] = head.split(' ');
    if (['GET', 'POST', 'PUT', 'DELETE'].indexOf(method) === -1) {
        socket.write('HTTP/1.1 405 Method Not Allowed\r\n\r\n');
        socket.end();
        return;
    }
    if (httpVersion !== 'HTTP/1.1') {
        socket.write('HTTP/1.1 505 HTTP Version Not Supported\r\n\r\n');
        socket.end();
        return;
    }
    const lastHeaderIndex = lines.indexOf('');
    const rawHeaders = lines.slice(1, lastHeaderIndex);
    // console.log('rawHeaders', rawHeaders);
    // console.log('data', lines);
    const url = new URL(`http://${socket.localAddress}:${socket.localPort}${requestPath}`);
    const requestHeaders = new Headers();
    for (const rawHeader of rawHeaders) {
        const [key, value] = rawHeader.split(': ');
        requestHeaders.set(key, value);
    }
    const req = new Request(url, {
        method,
        headers: requestHeaders,
    });
    const res = await handler(req);
    const statusCode = res.status;
    const statusText = res.statusText || statusTextByCode[statusCode] || '';
    const body = await res.arrayBuffer();
    if (!res.headers.has(commonHeaders.CONTENT_TYPE)) {
        res.headers.set(commonHeaders.CONTENT_TYPE, 'text/plain');
    }
    if (!res.headers.has(commonHeaders.CONTENT_LENGTH)) {
        res.headers.set(commonHeaders.CONTENT_LENGTH, body.byteLength + "");
    }
    const headers = [...res.headers.entries()].map(([key, value]) => `${key}: ${value}\r\n`).join('');
    socket.write(`${httpVersion} ${statusCode} ${statusText}\r\n${headers}\r\n`);
    socket.write(new Uint8Array(body));
    socket.end();
});

// Uncomment this to pass the first stage
server.listen(4221, 'localhost', () => {
    console.log('Server is running on port 4221');
});
