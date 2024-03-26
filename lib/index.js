"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = expressWs;
var _http = _interopRequireDefault(require("http"));
var _express = _interopRequireDefault(require("express"));
var _ws = _interopRequireDefault(require("ws"));
var _websocketUrl = _interopRequireDefault(require("./websocket-url"));
var _addWsMethod = _interopRequireDefault(require("./add-ws-method"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }
/* This module does a lot of monkeypatching, but unfortunately that appears to be the only way to
 * accomplish this kind of stuff in Express.
 *
 * Here be dragons. */

function expressWs(app, httpServer) {
  var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  var server = httpServer;
  if (server === null || server === undefined) {
    /* No HTTP server was explicitly provided, create one for our Express application. */
    server = _http["default"].createServer(app);
    app.listen = function serverListen() {
      var _server;
      return (_server = server).listen.apply(_server, arguments);
    };
  }

  /* Make our custom `.ws` method available directly on the Express application. You should
   * really be using Routers, though. */
  (0, _addWsMethod["default"])(app);

  /* Monkeypatch our custom `.ws` method into Express' Router prototype. This makes it possible,
   * when using the standard Express Router, to use the `.ws` method without any further calls
   * to `makeRouter`. When using a custom router, the use of `makeRouter` may still be necessary.
   *
   * This approach works, because Express does a strange mixin hack - the Router factory
   * function is simultaneously the prototype that gets assigned to the resulting Router
   * object. */
  if (!options.leaveRouterUntouched) {
    (0, _addWsMethod["default"])(_express["default"].Router);
  }

  // allow caller to pass in options to WebSocketServer constructor
  var wsOptions = options.wsOptions || {};
  wsOptions.server = server;
  var wsServer = new _ws["default"].Server(wsOptions);
  wsServer.on('connection', function (socket, request) {
    if ('upgradeReq' in socket) {
      request = socket.upgradeReq;
    }
    request.ws = socket;
    request.wsHandled = false;

    /* By setting this fake `.url` on the request, we ensure that it will end up in the fake
     * `.get` handler that we defined above - where the wrapper will then unpack the `.ws`
     * property, indicate that the WebSocket has been handled, and call the actual handler. */
    request.url = (0, _websocketUrl["default"])(request.url);
    var dummyResponse = new _http["default"].ServerResponse(request);
    dummyResponse.writeHead = function writeHead(statusCode) {
      if (statusCode > 200) {
        /* Something in the middleware chain signalled an error. */
        dummyResponse._header = ''; // eslint-disable-line no-underscore-dangle
        socket.close();
      }
    };
    app.handle(request, dummyResponse, function () {
      if (!request.wsHandled) {
        /* There was no matching WebSocket-specific route for this request. We'll close
         * the connection, as no endpoint was able to handle the request anyway... */
        socket.close();
      }
    });
  });
  return {
    app: app,
    getWss: function getWss() {
      return wsServer;
    },
    applyTo: function applyTo(router) {
      (0, _addWsMethod["default"])(router);
    }
  };
}