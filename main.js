// main.js
//
// This is the main entry point for the bot. We will run the main code and branch functions from here.
// Bots will connect and login using the token specified in a file named Token.js at the bottom of this file. 

const Discord = require('discord.js');
const fs = require('fs');

// Discord Client variable - everything is an event of this object. 
var client = new Discord.client();

// Variables
var trains = []; // Trains will be stored as an array of objects with properties. 
                 // Function getTrainChannels() will return an array of channel IDs we've created
                 // This will be saved every ~60 seconds to self recover if necessary. 
var waitingfortrain = new Object(); // This will be all users waiting for trains. 
var resupplies = new Object(); // Each user ID is a property that will have an integer from 0 to 50. 
var goodscount = new Object(); // Each user ID will have an amount of goods assigned to them
var potentialgoods = new Object(); // When we create a resupply reminder, we'll track this too
                                   // Every user will have this incremented by 0.5 every minute. 
                                   // We'll floor the value when using it. 

var userhonor = new Object(); // Every user's honor.
var usermsgcount = new Object(); // Every user's message count. 
var waitingtrainchannelid = 0; // This ID will be set by the admin. Users can request to join the train or check the current train message
var loggingchannelid = 0; // This ID will be set by the admin. It will log honor changes, etc.
var trainannouncementid = 0; // Ping users in this channel to board a train. They can also jump off from here. 
var goodstrainmsg = new Object(); // This is the list of users and their goods in a message embed. 
                                  // Only the top 30 players will be listed here. 
var goodstrainembedmax = 30;
var goodstrainmsgage = 0; // When this is 0, a new message will be sent and this will be set to 30. 

var boycottedtraincombos = new Object(); // When a user is not prepared for a train, they can skip this one. 
                                         // There'll be a 10 min timer before they can be matched with THIS group. 
                                         // Any group member change will create a new prompt. 

var thanksphrases = ['thanks','thnx','ty','thnks']; // All of the phrases people can do to thank people. 
var dissphrases = ['diss'] // All of the phrases people can do to remove honor.
var powerhonorroles = ['0000000000']; // This is an array holding all of the admin/moderator/other roles that can +- 6 honor.

// This is called when Discord finishes logging in. 
client.on('ready', () => {
    setInterval(() => {
        if (goodstrainmsgage <= 0) {
            try {
                goodstrainmsg.delete() // This will attempt to delete a prior train board message. If it fails, it'll catch and do nothing
            }
            catch (err) { }
            goodstrainmsgage = 30
            client.channels.fetch(waitingtrainchannelid).then((chan) => {
                chan.send(createTrainEmbed()).then((msg) => goodstrainmsg = msg)
            })
        }
        else {
            goodstrainmsgage--;
            goodstrainmsg.edit(createTrainEmbed())
        }
        resupplyTicker();
        trainmatch();
    }, 60000)
})

// This is called when someone says something
client.on('message', (msg) => {
    if (msg.author.bot === true) { return } // Ignore bot messages
    if (getTrainChannels().includes(msg.channel.id) === true) { // This is in one of the channels created for a train
        var train = getTrainbyChannel(msg.channel.id);
        // The last three users should be the highest honor. Check if the message is sent by someone from these three. 
        if (train.users.indexOf(msg.author.id) > (train.users.length - 3)) { 
            // Commands for these users. 
        }
        // Commands for everyone. 
        // Thanks. This will use any phrase listed in thanksphrases. 
        thanksphrases.forEach((thank) => {
            if (msg.content.toLowerCase().search(thank) == 0) {
                // Determine if this user is part of the powerhonorroles group.
                var powerful = false;
                var strength = 1;
                powerhonorroles.forEach((pow) => {
                    if (msg.member.roles.cache.get(pow) != undefined) { powerful = true }
                })
                // We've determined this person can do more than 1 at a time, lets see if they want to 
                if (powerful) {
                    var regex = /\d+/
                    var nummatch = msg.content.match(regex);
                    if (nummatch != undefined) {
                        // Ensure that the number is between 1 and 6. 
                        var num = parseInt(nummatch[0])
                        if (num > 6) { num = 6 }
                        if (num < 1) { num = 1 }
                        strength = num;
                    }
                }
                // If the user is tagged, then let's add their rightfully earned honor!
                if (msg.mentions.users.first != undefined) {
                    var honortarget = (msg.mentions.users.first).id
                    var honor = isNaN(userhonor[honortarget]) ? 0 : userhonor[honortarget]
                    userhonor[honortarget] = honor + strength;
                }
                else {
                    msg.channel.send("Please tag a user to thank.")
                }
            }
        })
        dissphrases.forEach((diss) => {
            if (msg.content.toLowerCase().search(diss) == 0) {
                // Determine if this user is part of the powerhonorroles group.
                var powerful = false;
                var strength = 1;
                powerhonorroles.forEach((pow) => {
                    if (msg.member.roles.cache.get(pow) != undefined) { powerful = true }
                })
                // We've determined this person can do more than 1 at a time, lets see if they want to 
                if (powerful) {
                    var regex = /\d+/
                    var nummatch = msg.content.match(regex);
                    if (nummatch != undefined) {
                        // Ensure that the number is between 1 and 6. 
                        var num = parseInt(nummatch[0])
                        if (num > 6) { num = 6 }
                        if (num < 1) { num = 1 }
                        strength = num;
                    }
                }
                // If the user is tagged, then let's remove their poorly earned honor!
                if (msg.mentions.users.first != undefined) {
                    var honortarget = (msg.mentions.users.first).id
                    var honor = isNaN(userhonor[honortarget]) ? 0 : userhonor[honortarget]
                    userhonor[honortarget] = honor - strength;
                }
                else {
                    msg.channel.send("Please tag a user to thank.")
                }
            }
        })
    }
    // Train boarding/skipping functions
    if (msg.channel.id == trainannouncementid) {
        if (msg.content.toLowerCase().search("out") != 0) {
            msg.reply("Are you sure you wish to leave the train queue? Reply No to stay or let it timeout (60 seconds) to leave.");
            var filter = m => (m.content.search('no')&&m.author.id === msg.author.id)
            var coll = msg.channel.createMessageCollector(filter, { timer: 60000 } )
            coll.on('collect', (collmsg) => {
                msg.channel.send("Cancelled. You're still in line.")
                coll.stop('cancel')
            })
            coll.on('end', (coll,reason) => {
                // The user did not cancel this, we should remove them from the train queue. 
                if (reason != 'cancel') {
                    try {
                        delete waitingfortrain[msg.author.id]
                    }
                    catch (err) { console.log(err) }
                }
            })
        }
    }
    // Check if the user is in a DM channel, here they can request to set their resupply to a certain amount of time
    // or they can set the amount of goods they have. 
    if (msg.channel.type == "dm") {
        // Check if the user wants to adjust their resupply timer
        if (msg.content.toLowerCase().search('resupply') == 0) {
            // Acknowledge that a resupply is done by saying "done" in the message somewhere.
            // This should capture resupply_done
            if (msg.content.toLowerCase().search('done') != 0) {
                goodsAdd(msg.author.id) // Combine the user's current and potential goods
                msg.channel.send(`Resupplied! You should now have ${parseInt(potentialgoods[msg.author.id])} goods. Please write 'goods <num>' if this isn't accurate. Resupply timer in 50 minutes.`)
                resupplyAdd(user.id); // The user just did a resupply, so 50 minutes to reminder.
            }
            else {
                var resupplyregex = /\d+/ // This is a regex to shorthand detect if someone says the number of mins they have
                var resupplymatch = msg.content.toLowerCase().match(resupplyregex)
                if (resupplymatch != null) {
                    var resupplycount = parseInt(resupplymatch[0])
                    if ((resupplycount > 50)||(resupplycount < 0)) {
                        msg.channel.send("Invalid resupply time provided.")
                    }
                    else {
                        
                        resupplyAdd(msg.author.id,resupplycount)
                    }
                }
                // The user did NOT tell us the minutes they want to resupply in, so let's create a message collector. 
                else {
                    var filter = m => (m.content.match(resupplyregex) != null);
                    var collector = msg.channel.createMessageCollector(filter, { time: 120000 }) // Listen for two minutes
                    collector.on('collect', (collmsg) => {
                        var collresupplymatch = collmsg.content.toLowerCase().match(resupplyregex);
                        if (collresupplymatch != null) {
                            var resupplycount = parseInt(collresupplymatch[0])
                            if ((resupplycount > 50)||(resupplycount < 0)) {
                                msg.channel.send("Invalid resupply time provided.")
                            }
                            else {
                                msg.channel.send(`Resupply timer set to remind in ${resupplycount} min.`)
                                resupplyAdd(msg.author.id,resupplycount)
                                collector.stop()
                            }
                        }
                    })
                }
            }
        } 
        if (msg.content.toLowerCase().search('goods') == 0) {
            var goodsregex = /\d+/ // This is a regex to shorthand detect if someone says the number of goods they have
            var goodsmatch = msg.content.toLowerCase().match(goodsregex)
            if (goodsmatch != null) {
                var resupplycount = parseInt(goodsmatch[0])
                if ((goodscount > 100)||(goodscount < 0)) {
                    msg.channel.send("Invalid goods count provided.")
                }
            }
            // The user did NOT tell us the amount of goods they have, so let's create a message collector. 
            else {
                var filter = m => (m.content.match(goodsregex) != null);
                var collector = msg.channel.createMessageCollector(filter, { time: 120000 }) // Listen for two minutes
                collector.on('collect', (collmsg) => {
                    var collgoodsmatch = collmsg.content.toLowerCase().match(goodsregex);
                    if (collgoodsmatch != null) {
                        var goodscount = parseInt(collgoodsmatch[0])
                        if ((goodscount > 50)||(goodscount < 0)) {
                            msg.channel.send("Invalid goods count provided.")
                        }
                        else {
                            msg.channel.send(`Goods count set to ${goodscount}.`)
                            goodsSet(msg.author.id,goodscount)
                            collector.stop()
                        }
                    }
                })
            }
        }
    }
})

// This is called when someone reacts to a message
client.on('messageReactionAdd', async (react,user) => {
    if (user.bot == true) { return } // Ignore Bot Reactions
    react.message.fetch((msg,err) => {
        // Check if this message was adding a reaction to a resupply reminder
        if ((msg.content.search("Reminder: You need to do your resupply.") == 0)&&(msg.channel.type == "dm")) {
            goodsAdd(user.id) // Combine the user's current and potential goods
            msg.channel.send(`Resupplied! You should now have ${parseInt(potentialgoods[user.id])} goods. Please write 'goods <num>' if this isn't accurate. Resupply timer in 50 minutes.`)
            resupplyAdd(user.id); // Reactions won't let us do any custom time, so the user will get 50 minutes.
        }
    })
})

// Functions
// 
// Train Functions
// Checks trains and returns an array of channel IDs. 
function getTrainChannels() {
    var channelids = [];
    if (trains.length > 0) {
        trains.forEach((train) => {
            channelids.push(train.channelid)
        })
    }
    return channelids;
}
// Returns a train given a channel ID
function getTrainbyChannel(inputchannelid) {
    var returntrain = undefined; // This is our return. If for some reason the train doesn't exist, return undefined and catch.
    if (trains.length > 0) {
        trains.forEach((train) => {
            if (train.channelid === inputchannelid) {
                returntrain = train;
            }
        })
    }
    return returntrain;
}

// Resupply Functions
// This will iterate over everyone registered and lower their count by 1 every minute. If it's 0, it'll attempt to DM the user
// This will also increment each person's potential goods by 0.5. 
function resupplyTicker() {
    var userids = Object.keys(resupplies);
    userids.forEach((user) => {
        var newval = resupplies[user] - 1;
        if (newval == 0) {
            try {
                var userobject = client.users.fetch(user);
                userobject.send('Reminder: You need to do your resupply. Please reply to this message or react to it to restart your resupply timer.').then((msg) => {
                }, (err) => {
                    console.log(err);
                })
            }
            catch (err) {
                console.log(err);
            }
            delete resupplies[user];
        }
        else {
            resupplies[user] = newval;
        }
    })
    var puserids = Object.keys(potentialgoods);
    puserids.forEach((user) => {
        var newval = potentialgoods[user] + 0.5;
        if (newval >= 100) {
            potentialgoods[user] = 100;
        }
        else {
            potentialgoods[user] = newval;
        }
    })
}
// User has acknowledged or subscribed to a resupply notification
function resupplyAdd(userid,timeremaining = 50) {
    resupplies[userid] = timeremaining;
    // Check how many minutes under 50 we are. Divide by two to get new potential goods
    potentialgoods[userid] = ((50 - timeremaining) / 2)
}
// Adds together goods a user might have (if it's tracked, else sets it if it isn't) and potential goods
// Returns the new goods value. 
function goodsAdd(userid) {
    // Fetch current goods or set to 0 if it's untracked
    var currgoods = (goodscount[userid] != undefined) ? goodscount[userid] : 0
    // Fetch future goods or set to 0 if it's untracked
    var pgoods = (potentialgoods[userid] != undefined) ? potentialgoods[userid] : 0
    var combinedgoods = currgoods + pgoods;
    if (combinedgoods >= 100) {
        combinedgoods = 100
    }
    goodscount[userid] = combinedgoods;
    potentialgoods[userid] = 0;
    return combinedgoods;
}
// Sets goods amount to this number. 0 is the default to initialize someone. 
function goodsSet(userid,num = 0) {
    goodscount[userid] = num;
}

// Train Tracking Functions
// This will create our message that should be checked every minute
function createTrainEmbed() {
    var goodskeys = Object.keys(goodscount);
    var goodscountarray = [];
    var traingoodscountarray = [];
    var sortedgoodscount = [];
    var sortedtraincount = [];
    goodskeys.forEach((key) => {
        var currhonor = (userhonor[key] != undefined) ? userhonor[key] : 0
        var object = {
            userid: key,
            goodscount: goodscount[key],
            honor: currhonor
        }
        if (waitingfortrain.hasOwnProperty(key) == true) {
            traingoodscountarray.push(object)
        }
        else {
            goodscountarray.push(object)
        }
    })
    // Sort by honor, then sort by goods count. Higher goods WILL be higher, but any tied values will have higher honor. 
    if (goodscountarray.length > 0) {
        sortedgoodscount = goodscountarray.sort((a,b) => {
            return b.honor - a.honor
        }).sort((a,b) => {
            return b.goodscount - a.goodscount
        })
    }
    if (traingoodscountarray.length > 0) {
        sortedtraincount = traingoodscountarray.sort((a,b) => {
            return b.honor - a.honor
        }).sort((a,b) => {
            return b.goodscount - a.goodscount
        })
    }
    var starttrainstring = `Users waiting for a train:\n`
    var count = goodstrainembedmax;
    // Iterate over people waiting for train first. 
    while((sortedtraincount.length > 0)&&(count > 0)) {
        starttrainstring = `${starttrainstring}<@${sortedtraincount[0].userid}> - Goods ${sortedtraincount[0].goodscount}\n`
        sortedtraincount.shift();
        count--;
    } 
    if (count > 0) {
        starttrainstring = `${starttrainstring}\nGoods count by user:`
    }
    while((sortedgoodscount.length > 0)&&(count > 0)) {
        starttrainstring = `${starttrainstring}<@${sortedgoodscount[0].userid}> - Goods ${sortedgoodscount[0].goodscount}\n`
        sortedgoodscount.shift();
        count--;
    } 
    var msgembed = new Discord.MessageEmbed
    msgembed.setDescription(starttrainstring)
    return msgembed;
}
// This will attempt to form a train with 7 users. If there isn't 7 users available, no train will be formed. 
function trainmatch() {
    var goodskeys = Object.keys(waitingfortrain);
    if (goodskeys.length > 6) {
        var sortedtraincount;
        goodskeys.forEach((key) => {
            var currhonor = (userhonor[key] != undefined) ? userhonor[key] : 0
            var object = {
                userid: key,
                goodscount: goodscount[key],
                honor: currhonor
            }
            traingoodscountarray.push(object)
        })
        // Sort by honor, then sort by goods count. Higher goods WILL be higher, but any tied values will have higher honor. 
        if (traingoodscountarray.length > 0) {
            sortedtraincount = traingoodscountarray.sort((a,b) => {
                return b.honor - a.honor
            }).sort((a,b) => {
                return b.goodscount - a.goodscount
            })
        }
        var trainmembers = [];
        var okay = false;
        const seekmembers = () => {
            trainmembers.push(sortedtraincount[0])
            sortedtraincount.shift();
        }
        // Get 7 members that have not boycotted each other. 
        while(okay == false) {
            var proceed = true;
            if (trainmembers.length < 7) { 
                seekmembers();
                proceed = false;
            }
            else if (sortedtraincount.length == 0) {
                okay = true;
                return
            }
            else {
                trainmembers.forEach((member) => {
                    // Check if anyone has boycotted this combo
                    if (boycottedtraincombos[member] != null) {
                        boycottedtraincombos.forEach((boycott) => {
                            if (boycott.members.sort() == trainmembers.sort()) {
                                trainmembers.splice(trainmembers.indexOf(member),1)
                                proceed = false;
                            }
                        })
                    }
                })
            }
            // This should be set true whenever we have a set of 7 people that have not boycotted each other.
            if (proceed == true) {
                okay = true;
            }
        }
        // Do a last check to ensure we have 7 members
        if (trainmembers.length < 7) { return }
        // Sort only by honor, even if goods are insufficient
        sortedtraincount = sortedtraincount.sort((a,b) => {
            return b.honor - a.honor
        })
        // Form the message to send to users









        
    }
}

// Logging Functions
// These functions are called when a logging event happens. 
function loggingHonorChange(giver,recipient,delta) {
    if (loggingchannelid != 0) {
        var textdelta = delta;
        if (delta > 0) {
            textdelta = `+${delta}`
        }
        var msgembed = new Discord.MessageEmbed;
        msgembed.setDescription(`Honor change:\n<@${giver}> -> <@${recipient}> ${textdelta}, Total: ${userhonor[recipient]}`)
        client.channels.fetch(loggingchannelid).then((chan) => {
            chan.send(msgembed)
        })
    }
}
// Someone's message was deleted. 
function deletedMessage(message) {
    if (loggingchannelid != 0) {
        var msgembed = new Discord.MessageEmbed;
        msgembed.setDescription(`Message Deleted from <@${message.author.id}>: ${message.content}`)
        client.channels.fetch(loggingchannelid).then((chan) => {
            chan.send(msgembed)
        })
    }
}
// Called when someone has a role change or a nickname update
function userChange(olduser,newuser) {
    if (loggingchannelid != 0) {
        var msgembed = new Discord.MessageEmbed;
        if (olduser.displayName != newuser.displayName) {
            msgembed.setDescription(`<@${newuser.id}> (ID ${newuser.id}) updated their nickname:\n${olduser.displayName} -> ${newuser.displayName}`)
            client.channels.fetch(loggingchannelid).then((chan) => {
                chan.send(msgembed)
            })
        }
        else if (olduser.roles.cache.difference(newuser.roles.cache).length > 0) {
            var newuserroles = newuser.roles.cache
            var olduserroles = olduser.roles.cache
            newuserroles.sweep((r) => olduser.roles.cache.get(r) == undefined)
            olduserroles.sweep((r) => newuser.roles.cache.get(r) == undefined)
            var string = `<@${newuser.id}> (ID ${newuser.id}) roles have been updated:`
            if (newuserroles.length > 0) {
                string = `${string}\n\nAdded Roles: `
                newuserroles.forEach((role) => { string = `${string}${role}`})
            }
            if (olduserroles.length > 0) {
                string = `${string}\n\nRemoved Roles: `
                olduserroles.forEach((role) => { string = `${string}${role}`})
            }
            msgembed.setDescription(string)
            client.channels.fetch(loggingchannelid).then((chan) => {
                chan.send(msgembed)
            })
        }
    }
}

// Read Token.txt and attempt to login using that token. 
client.login(fs.readFileSync('./Token.txt',(token) => { return token }));