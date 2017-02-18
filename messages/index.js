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

    var stateObject = {
        address: session.message.address,
        text: session.message.text
    };

    luis.getIntent(session.message.text, function(err, response) {
        var intent = response.topScoringIntent.intent;
        var entities = response.entities;

        switch (intent) {
            case 'Login':
                console.log('... to Login intent');
                var stateObjectBuffer = new Buffer(JSON.stringify(stateObject)).toString('base64');
                var card = new builder.SigninCard(session)
                    .text('Gmail (Google) Sign-in')
                    .button('Sign-in', google.generateAuthURL() + '&state=' + stateObjectBuffer);

                var msg = new builder.Message(session).addAttachment(card);

                // If message was typed in a group/channel, turn it into PM as this is login
                if ((typeof session.message.address.conversation.name !== 'undefined') && (session.message.address.channelId != 'webchat')) delete session.message.address.conversation;

                session.send(msg);
                break;
            case 'Greet':
                var greetings = ['Hey', 'Yo', 'Whatup', 'Hiya', 'Yeah?', 'Lol', 'Upupdowndown', 'Bonjour', 'Hola', 'Guten tag', 'Ciao', 'Kamusta', 'Namaste'];
                session.send(greetings[Math.floor(Math.random() * greetings.length)]);
                break;
            default:
                //if ((typeof session.message.address.conversation.name !== 'undefined') && (session.message.address.channelId != 'webchat')) delete session.message.address.conversation;
                session.send('Default message')
                break;
        }
    });
});

bot.on('trigger', function(message) {
    //console.log('Triggered');
    // Handle message from trigger function
    var queuedMessage = message.value;
    var address = queuedMessage.address;
    //var payload = JSON.parse(queuedMessage.text); // will have .origin and .intent
    var payload = queuedMessage.payload;

    // Becomes a PM to Slack when .conversation is removed
    if (address.channelId != 'webchat') delete address.conversation;

    switch (payload.origin) {
        case 'bot':
            if (payload.intent == 'login') {
                var reply = new builder.Message()
                    .address(address)
                    //.text('This is coming from the trigger: ' + JSON.stringify(message));
                    .text('You have logged in!');
            }
            break;
        default:
            var reply = new builder.Message()
                .address(address)
                //.text('This is coming from the trigger: ' + JSON.stringify(message));
                .text('No intent recognized - this is a default reply');
            break;
    }

    // Send it to the channel
    bot.send(reply);

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
