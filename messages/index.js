"use strict";
var builder = require("botbuilder");
var botbuilder_azure = require("botbuilder-azure");
var luis = require('./luis_stub.js');
var google = require('./google.js');

var useEmulator = (process.env.NODE_ENV == 'development');

var connector = useEmulator ? new builder.ChatConnector() : new botbuilder_azure.BotServiceConnector({
    appId: process.env['MicrosoftAppId'],
    appPassword: process.env['MicrosoftAppPassword'],
    stateEndpoint: process.env['BotStateEndpoint'],
    openIdMetadata: process.env['BotOpenIdMetadata']
});

var bot = new builder.UniversalBot(connector);

bot.dialog('/', function(session) {
    //session.send('You said ' + session.message.text);

    luis.getIntent(session.message.text, function(err, response) {
        var intent = response.topScoringIntent.intent;
        var entities = response.entities;

        switch (intent) {
            case 'Login':
                console.log('... to Login intent');
                //var stateObjectBuffer = new Buffer(JSON.stringify(stateObject)).toString('base64');
                var card = new builder.SigninCard(session)
                    .text('Gmail (Google) Sign-in')
                    .button('Sign-in', google.generateAuthURL());

                var msg = new builder.Message(session).addAttachment(card);

                // If message was typed in a group/channel, turn it into PM as this is login
                if ((typeof session.message.address.conversation.name !== 'undefined') && (session.message.address.channelId != 'webchat')) delete session.message.address.conversation;

                session.send(msg);
                break;
            default:
                //if ((typeof session.message.address.conversation.name !== 'undefined') && (session.message.address.channelId != 'webchat')) delete session.message.address.conversation;
                session.send('Hey')
                break;
        }
    });
});

if (useEmulator) {
    var restify = require('restify');
    var server = restify.createServer();
    server.listen(3978, function() {
        console.log('test bot endpont at http://localhost:3978/api/messages');
    });
    server.post('/api/messages', connector.listen());
} else {
    module.exports = {
        default: connector.listen()
    }
}
