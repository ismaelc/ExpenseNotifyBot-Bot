"use strict";
var builder = require("botbuilder");
var botbuilder_azure = require("botbuilder-azure");
var luis = require('./luis_stub.js');
var google = require('./google.js');
//var db = require('./documentdb.js');
//var queue = require('./queue.js');
var azure = require('fast-azure-storage');

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

        // TODO: Need logout that would not only delete DB entry,
        // but actually expire tokens so that they would need to
        // login and connect accounts again
        switch (intent) {
            case 'Login':
                console.log('... to Login intent');

                var channelId = session.message.address.channelId;
                var stateObjectBuffer = new Buffer(JSON.stringify(stateObject)).toString('base64');
                var signin = google.generateAuthURL() + '&state=' + stateObjectBuffer;
                var msg;

                // MS teams does not support Sign-in card, dumb it down
                if (channelId == 'msteams') {
                    msg = '[Gmail (Google) Sign-in](' + signin + ')';
                } else {
                    var card = new builder.SigninCard(session)
                        .text('Gmail (Google) Sign-in')
                        //.button('Sign-in', google.generateAuthURL() + '&state=' + stateObjectBuffer);
                        .button('Sign-in', signin);

                    msg = new builder.Message(session).addAttachment(card);
                }

                // If message was typed in a group/channel, turn it into PM as this is login
                if ((typeof session.message.address.conversation.name !== 'undefined') && (session.message.address.channelId != 'webchat')) delete session.message.address.conversation;

                session.send(msg);
                break;
            case 'Logout':

                // Get user's session address

                var address = session.message.address;

                // What to send
                var payload = {
                    'origin': 'bot',
                    'intent': 'logout_request',
                    'bot_address': address
                };

                var queuedMessage = {
                    address: null,
                    payload: payload
                };

                var queue = new azure.Queue({
                    accountId: process.env['STORAGE_ACCOUNTID'],
                    accessKey: process.env['STORAGE_ACCESSKEY']
                });

                // Create queue and insert message
                queue.createQueue('js-queue-items-from-bot')
                    .then(function() {
                        return queue.putMessage('js-queue-items-from-bot',
                            new Buffer(JSON.stringify(queuedMessage)).toString('base64'), {
                                //visibilityTimeout: 1, // Visible after 1 seconds
                                //messageTTL: 60 * 60 // Expires after 1 hour
                            })
                    })
                    .then((msg) => {
                        session.send('Logging you out...');
                    })
                    .catch((error) => {
                        session.send('Error: ' + JSON.stringify(error));
                    });

                break;
            case 'Greet':
                var greetings = ['Hey', 'Yo', 'Whatup', 'Hiya', 'Yeah?', 'Lol', 'Upupdowndown', 'Bonjour', 'Hola', 'Guten tag', 'Ciao', 'Kamusta', 'Namaste'];
                session.send(greetings[Math.floor(Math.random() * greetings.length)]);
                break;
            default:
                //if ((typeof session.message.address.conversation.name !== 'undefined') && (session.message.address.channelId != 'webchat')) delete session.message.address.conversation;
                session.send('Default message (debug): ' + JSON.stringify(session.message.address));
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
    if ((typeof payload) == 'string') payload = JSON.parse(payload);

    // Becomes a PM to Slack when .conversation is removed
    if ((address.channelId != 'webchat') &&
        (address.channelId != 'msteams')
    )
        delete address.conversation;

    var reply;
    switch (payload.origin) {
        case 'bot':
            if (payload.intent == 'login') {
                reply = new builder.Message()
                    .address(address)
                    //.text('This is coming from the trigger: ' + JSON.stringify(message));
                    .text('You have logged in!');
            } else if (payload.intent == 'logout_request') {
                reply = new builder.Message()
                    .address(address)
                    //.text('This is coming from the trigger: ' + JSON.stringify(message));
                    .text('You have been logged out.');
            }
            break;
        case 'process_mail':
            if (payload.intent == 'ask_user_if_receipt') {

                /*
                reply = new builder.Message()
                    .address(address)
                    //.text('This is coming from the trigger: ' + JSON.stringify(message));
                    .text('Message from process_mail: ' + JSON.stringify(payload));
                */

                var quick_expense = {
                    'title': payload.valid_mail.subject,
                    'date': payload.valid_mail.prime_date,
                    'amount': payload.valid_mail.prime_amount
                }

                /*
                // This is a receipt card, but doesn't work for Teams
                var card = new builder.ReceiptCard()
                    .title(truncate(payload.valid_mail.subject))
                    //.title('Short')
                    .facts([
                        builder.Fact.create(null, payload.valid_mail.prime_date, 'Date')
                        //builder.Fact.create(null, 'VISA 5555-****', 'Payment Method')
                    ])
                    .items([

                        //builder.ReceiptItem.create(null, payload.valid_mail.prime_amount.replace('$', '$ '), 'Amount')
                        //builder.ReceiptItem.create(null, '$4.50'.replace('$', '$ '), 'Amount')
                        //.quantity(1)
                        //.image(builder.CardImage.create(null, 'https://github.com/amido/azure-vector-icons/raw/master/renders/cloud-service.png'))

                    ])
                    //.tax('$ 0.00')
                    .total(payload.valid_mail.prime_amount.replace('$', '$ '))
                    //.total('$ 9.99')
                    .buttons([

                        //builder.CardAction.openUrl(null, 'https://azure.microsoft.com/en-us/pricing/', 'Send to Concur')
                        //.image('https://raw.githubusercontent.com/amido/azure-vector-icons/master/renders/microsoft-azure.png'),

                        builder.CardAction.dialogAction(null, "send_to_concur", quick_expense, "Send to Concur")

                    ]);
                */

                var card = new builder.ThumbnailCard()
                    .title(payload.valid_mail.subject)
                    .subtitle(payload.valid_mail.prime_date)
                    .text('Total: ' + payload.valid_mail.prime_amount.replace('$', '$ '))
                    .images([
                        builder.CardImage.create(null, 'https://sec.ch9.ms/ch9/7ff5/e07cfef0-aa3b-40bb-9baa-7c9ef8ff7ff5/buildreactionbotframework_960.jpg')
                    ])
                    .buttons([
                        //builder.CardAction.openUrl(null, 'https://docs.botframework.com/en-us/', 'Send to Concur')
                        builder.CardAction.dialogAction(null, "send_to_concur", quick_expense, "Send to Concur")
                    ]);

                reply = new builder.Message()
                    .address(queuedMessage.address)
                    .addAttachment(card);


            } else if (payload.intent == 'ask_user_to_relogin') {
                var reply = new builder.Message()
                    .address(address)
                    //.text('This is coming from the trigger: ' + JSON.stringify(message));
                    .text('Please login again');
            }
            break;
        case 'trigger_frombot':
            if(payload.intent == 'login_request_concur') {
                var reply = new builder.Message()
                    .address(address)
                    //.text('This is coming from the trigger: ' + JSON.stringify(message));
                    .text('You need to login to Concur first - [link](https://test.com)');
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

// Click handler for 'Send to Concur'
bot.dialog('/send_to_concur', [
    function(session, args) {
        var user_data = session.userData;
        var quick_expense = args.data;

        // Send to queue-from-bot with instruction to quick expense
        // ? where do we check if Concur is logged in - state or DB

        var address = session.message.address;

        var payload = {
            'origin': 'bot',
            'intent': 'quick_expense',
            'bot_address': address
        };

        var queuedMessage = {
            address: null,
            payload: payload
        };

        var queue = new azure.Queue({
            accountId: process.env['STORAGE_ACCOUNTID'],
            accessKey: process.env['STORAGE_ACCESSKEY']
        });

        // Create queue and insert message
        queue.createQueue('js-queue-items-from-bot')
            .then(function() {
                return queue.putMessage('js-queue-items-from-bot',
                    new Buffer(JSON.stringify(queuedMessage)).toString('base64'), {
                        //visibilityTimeout: 1, // Visible after 1 seconds
                        //messageTTL: 60 * 60 // Expires after 1 hour
                    })
            })
            .then((msg) => {
                session.send('Sending quick expense to Concur...');
                session.endDialog();
            })
            .catch((error) => {
                session.send('Error (quick expense): ' + JSON.stringify(error));
                session.endDialog();
            });

        /*
        session.send('QE data: ' + JSON.stringify(quick_expense));
        session.endDialog();
        */
    }
]);

bot.beginDialogAction('send_to_concur', '/send_to_concur');

if (useEmulator) {
    var restify = require('restify');
    var server = restify.createServer();
    server.listen(3978, function() {
        console.log('test bot endpoint at http://localhost:3978/api/messages');
    });
    server.post('/api/messages', connector.listen());
} else {

    /*
    module.exports = {
        default: connector.listen()
    }
    */

    var listener = connector.listen();
    var withLogging = function(context, req) {
        console.log = context.log;
        listener(context, req);
    }

    module.exports = {
        default: withLogging
    }

}

function truncate(string) {
    var max = 30;
    if (string.length > max)
        return string.substring(0, max) + '...';
    else
        return string;
};
