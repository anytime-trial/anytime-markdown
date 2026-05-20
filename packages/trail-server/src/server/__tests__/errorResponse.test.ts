import { sendServerError } from '../errorResponse';
import type * as http from 'node:http';

function makeMockRes() {
  const headers: Record<string, string> = {};
  let statusCode = 0;
  let body = '';
  const res = {
    writeHead: jest.fn((code: number, hdrs?: Record<string, string>) => {
      statusCode = code;
      if (hdrs) Object.assign(headers, hdrs);
    }),
    end: jest.fn((data?: string) => { body = data ?? ''; }),
    get statusCode() { return statusCode; },
    get body() { return body; },
    get headers() { return headers; },
  } as unknown as http.ServerResponse & { body: string; headers: Record<string, string> };
  return res;
}

describe('sendServerError', () => {
  it('sends 500 with default message', () => {
    const res = makeMockRes();
    sendServerError(res);
    expect(res.writeHead).toHaveBeenCalledWith(500, { 'Content-Type': 'application/json' });
    expect(JSON.parse((res as { body: string }).body)).toEqual({ error: 'Internal server error' });
  });

  it('sends 500 with custom message', () => {
    const res = makeMockRes();
    sendServerError(res, 'Something went wrong');
    expect(res.writeHead).toHaveBeenCalledWith(500, { 'Content-Type': 'application/json' });
    expect(JSON.parse((res as { body: string }).body)).toEqual({ error: 'Something went wrong' });
  });
});
