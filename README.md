# Serverless Chat WebSocket Backend

This TypeScript code represents the backend logic for a serverless chat application using AWS Lambda, DynamoDB, and API Gateway WebSocket.

## Prerequisites

- Node.js
- AWS SDK
- `aws-lambda` package
- `jsonwebtoken` package

## Functions

### `connectionManager`

Handles connecting and disconnecting for the WebSocket.

- **Event**: `APIGatewayProxyEvent`
- **Returns**: `APIGatewayProxyResult`

### `default_message`

Send back an error when an unrecognized WebSocket action is received.

- **Event**: `APIGatewayProxyEvent`
- **Returns**: `APIGatewayProxyResult`

### `get_recent_messages`

Return the 10 most recent chat messages.

- **Event**: `APIGatewayProxyEvent`
- **Returns**: `APIGatewayProxyResult`

### `send_message`

When a message is sent on the socket, verify the passed-in token, and forward it to all connections if successful.

- **Event**: `APIGatewayProxyEvent`
- **Returns**: `APIGatewayProxyResult`

### `ping`

Sanity check endpoint that echoes back 'PONG' to the sender.

- **Event**: None
- **Returns**: `APIGatewayProxyResult`

### `sendToConnection`

Helper function to send data to a specific WebSocket connection.

- **Parameters**:
  - `connectionId`: string - The WebSocket connection ID.
  - `data`: any - The data to send.
  - `event`: `APIGatewayProxyEvent` - The original WebSocket event.

- **Returns**: `Promise<void>`

## Deployment

Deploy this code as an AWS Lambda function, and configure the necessary AWS resources like DynamoDB and API Gateway WebSocket.

## Testing

```npm install -g wscat```

Once installed connect to web-socket endpoint 

```wscat -c <YOUR_WEBSOCKET_ENDPOINT>```

Then send it requests, using “action” as the route value:

```{"action": "sendMessage", "username": "Ralph", "content": "Hello !"}```


## License

This code is licensed under the [MIT License](LICENSE).