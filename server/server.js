/*jshint node: true */
"use strict";

var fs = require( 'fs' );
var express = require( 'express' );
var request = require( 'request' );
var api = require('./api.js');
var services = require('rest-tool-common').services;
var httpProxy = require('http-proxy');
var proxy = new httpProxy.RoutingProxy();

// Get configured
var config = {};
exports.config = config;
if( process.argv.length >= 3 ) {
    var baseConfig = require( './config.js' );
    config = baseConfig.setEnvironment( process.argv[2] );
} else {
    config = require( './config.js' ).parameters;
}
console.log( config );

// Load services config and service descriptors
services.load(__dirname + '/' + config.restapiRoot);
var allServices = services.getServices();
var servicesConfig = services.getConfig();
console.log('restapi config:', servicesConfig);

var server = module.exports = express();
server.set('env', config.environment );

// Configure the middlewares
server.configure( function() {
        server.use( express.bodyParser() );
        server.use( express.methodOverride() );
        server.use( express.cookieParser() );
        server.use( express.session( {secret: 'keyboard cat'} ) );
        server.use( server.router );

        var docRoots = config.documentRoot.split(':'),
            len = docRoots.length,
            i = 0;
        for (; i<len; i++) {
            server.use( express.static( __dirname + '/' + docRoots[i] ) );
        }
    });

console.log('Static content: ', __dirname + '/' + config.documentRoot);

function restrict( req, res, next ) {
    next();
}

function accessLogger( req, res, next ) {
    console.log( req.method, req.url );
    next();
}

// Routes
server.all("*", accessLogger, restrict);

function writeHeader(response) {
    //response.statusCode = 500;
    response.header( 'Content-Type', 'application/json' );
    response.header( 'X-pmd-api-API-Version', servicesConfig.apiVersion );
}
exports.writeHeader = writeHeader;

function writeResponse(response, content) {
    writeHeader(response);
    response.write( JSON.stringify(content, null, '  ') );
    response.end( '\n' );
}
exports.writeResponse = writeResponse;

var defaultServiceCall = function (request, response, serviceDesc) {
    response.header( 'Content-Type', 'application/json' );
    // TODO: Use Headers and Cookies from serviceDesc
    writeResponse(response, services.getMockResponseBody(request.method, serviceDesc ) || serviceDesc);
};

var reformatUrlPattern = function (urlPattern) {
    // TODO: Replace {parameter} to :parameter
    var resultPattern = urlPattern.replace(/{/gi, ":").replace(/}/gi, "").toString();
    console.log(resultPattern);
    return resultPattern;
};

// Setup the services for mocking
function registerServiceMethod(serviceDesc, method) {
    console.log('register service ' + method + ' ' + serviceDesc.urlPattern);
    var methodDesc = serviceDesc.methods[method];
    var implementation = eval( serviceDesc.methods[method].implementation ) || defaultServiceCall;
    server[method.toLowerCase()](servicesConfig.serviceUrlPrefix + reformatUrlPattern(serviceDesc.urlPattern), function(request, response) {
        implementation(request, response, serviceDesc);
    });
}

for ( var service in allServices ) {
    if ( allServices.hasOwnProperty(service) ) {
        var serviceDesc = allServices[service];
        for ( var method in allServices[service].methods ) {
            if ( serviceDesc.methods.hasOwnProperty(method) ) {
                registerServiceMethod(serviceDesc, method);
            }
        }
    }
}

// Start the server to listen
server.listen( config.port );
console.log( "Express server listening on port %d in %s mode",
    config.port, server.settings.env );
