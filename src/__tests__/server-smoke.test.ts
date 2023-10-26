import { startServer, waitForEbb } from '../server';
import type { Server } from 'http';
import request from 'supertest';

jest.mock("../serialport-serialport")
jest.mock("../ebb")
jest.mock("../server", () => {
  const original = jest.requireActual("../server");
  return {
      ...original,
      waitForEbb: jest.fn(()=> 'fake-ebb-path'),
  };
});

describe('Server Smoke Test', () => {
let server: Server;

  beforeAll(async () => {
    server = await startServer(0);
  });

  afterAll( () => {
    server.close();
  });

  test('POST /cancel should return 200 OK', async () => {
    const response = await request(server).post('/cancel');
    expect(response.status).toBe(200);
  });

});
