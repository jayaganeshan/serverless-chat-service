import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as AWS from 'aws-sdk';
import * as jwt from 'jsonwebtoken';
import { v4 } from 'uuid';

const logger = console;

const dynamodb = new AWS.DynamoDB.DocumentClient();

interface ConnectionManagerResponse {
  statusCode: number;
  body: string;
}

function getBody(event: APIGatewayProxyEvent): Record<string, any> {
  try {
    return JSON.parse(event.body ?? '{}');
  } catch (error) {
    logger.debug('Event body could not be JSON decoded.');
    return {};
  }
}

function getResponse(statusCode: number, body: any): APIGatewayProxyResult {
  if (typeof body !== 'string') {
    body = JSON.stringify(body);
  }
  return { statusCode, body };
}

async function sendToConnection(connectionId: string, data: any, event: APIGatewayProxyEvent): Promise<void> {

  const gateWayApi = new AWS.ApiGatewayManagementApi({
    endpoint: `https://${event["requestContext"]["domainName"]}/${event["requestContext"]["stage"]}`
  })

  await gateWayApi.postToConnection({
    ConnectionId: connectionId,
    Data: JSON.stringify(data)
  }).promise();
}

export const connection_manager = async (event: APIGatewayProxyEvent): Promise<ConnectionManagerResponse> => {
  const connectionId = event.requestContext.connectionId;
  const token = event.queryStringParameters ? event.queryStringParameters.token : null;

  if (event.requestContext.eventType === 'CONNECT') {
    logger.info(`Connect requested (CID: ${connectionId}, Token: ${token})`);

    if (!connectionId) {
      logger.error('Failed: connectionId value not set.');
      return getResponse(500, 'connectionId value not set.');
    }

    if (!token) {
      logger.debug('Failed: token query parameter not provided.');
      return getResponse(400, 'token query parameter not provided.');
    }
    let payload
    try {
      payload = jwt.verify(token, 'FAKE_SECRET', { algorithms: ['HS256'] }) as { username: string };
      logger.info(`Verified JWT for '${payload.username}'`);
    } catch (error) {
      logger.debug('Failed: Token verification failed.');
      return getResponse(400, 'Token verification failed.');
    }

    const params: AWS.DynamoDB.DocumentClient.PutItemInput = {
      TableName: 'serverless-chat_Connections',
      Item: { ConnectionID: connectionId, username: payload.username },
    };

    await dynamodb.put(params).promise();
    return getResponse(200, 'Connect successful.');
  } else if (event.requestContext.eventType === 'DISCONNECT') {
    logger.info(`Disconnect requested (CID: ${connectionId})`);

    if (!connectionId) {
      logger.error('Failed: connectionId value not set.');
      return getResponse(500, 'connectionId value not set.');
    }

    const params: AWS.DynamoDB.DocumentClient.DeleteItemInput = {
      TableName: 'serverless-chat_Connections',
      Key: { ConnectionID: connectionId },
    };

    await dynamodb.delete(params).promise();
    return getResponse(200, 'Disconnect successful.');
  } else {
    logger.error(`Connection manager received unrecognized eventType '${event.requestContext.eventType}'`);
    return getResponse(500, 'Unrecognized eventType.');
  }
};

export const default_message = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  logger.info('Unrecognized WebSocket action received.');
  return getResponse(400, 'Unrecognized WebSocket action.');
};

export const get_recent_messages = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId;
  logger.info(`Retrieving most recent messages for CID '${connectionId}'`);

  if (!connectionId) {
    logger.error('Failed: connectionId value not set.');
    return getResponse(500, 'connectionId value not set.');
  }

  const params: AWS.DynamoDB.DocumentClient.ScanInput = {
    TableName: 'serverless-chat_Messages',
    FilterExpression: "Room= :room",
    ExpressionAttributeValues: { ':room': 'general' },
  };

  const response = await dynamodb.scan(params).promise();
  const items = response.Items || [];

  const messages = items.map((x: any) => ({ username: x.Username, content: x.Content }));
  messages.reverse();

  const data = { messages };
  await sendToConnection(connectionId, data, event);

  return getResponse(200, `Sent recent messages to '${connectionId}'.`);
};

export const send_message = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  logger.info('Message sent on WebSocket.');

  const body = getBody(event);
  if (!body || typeof body !== 'object') {
    logger.debug('Failed: Invalid body format');
    return getResponse(400, 'Invalid body format');
  }

  for (const attribute of ['token', 'content']) {
    if (!(attribute in body)) {
      logger.debug(`Failed: '${attribute}' not in message .`);
      return getResponse(400, `'${attribute}' not in message.`);
    }
  }

  try {
    const payload = jwt.verify(body.token, 'FAKE_SECRET', { algorithms: ['HS256'] }) as { username: string };
    const username = payload.username;
    logger.info(`Verified JWT for '${username}'`);

    const timestamp = Math.floor(Date.now() / 1000);
    const content = body.content;

    const messageParams: AWS.DynamoDB.DocumentClient.PutItemInput = {
      TableName: 'serverless-chat_Messages',
      Item: { Room: 'general', Id: v4(), Timestamp: timestamp, Username: username, Content: content },
    };

    await dynamodb.put(messageParams).promise();

    const connectionTableParams: AWS.DynamoDB.DocumentClient.ScanInput = {
      TableName: 'serverless-chat_Connections',
      ProjectionExpression: 'ConnectionID',
    };

    const connectionResponse = await dynamodb.scan(connectionTableParams).promise();
    const connections = (connectionResponse.Items || []).map((x: any) => x.ConnectionID).filter((x: any) => x);

    const message = { username, content };
    const data = { messages: [message] };

    for (const connectionId of connections) {
      await sendToConnection(connectionId, data, event);
    }

    return getResponse(200, `Message sent to ${connections.length} connections.`);
  } catch (error) {
    logger.debug('Failed: Token verification failed.');
    return getResponse(400, 'Token verification failed.');
  }
};

export const ping = async (): Promise<APIGatewayProxyResult> => {
  logger.info('Ping requested.');
  return getResponse(200, 'PONG!');
};