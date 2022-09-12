const { Given, When, Then, Before } = require('@cucumber/cucumber');
const assert = require('assert').strict
const axios = require('axios')
const ethers = require("ethers")

//const api_url = 'http://dlt.example.com:3005';
const api_url = 'http://localhost:3010';

Given('a valid API user', async function () {
    try {
        this.response = await make_post("registerUser", this.params)
        this.params = {
            api_token: this.response.data.data.api_token
        }
    } catch (err) {
        this.response = err.response
    }
})


Given('a user with a randomly generated ethereum privkey', function() {
    //first two characters "Ox" are deleted 
    this.params = {
        privateKey: ethers.Wallet.createRandom().privateKey.slice(2)
    }
})

Given('a user with an invalid ethereum privkey', function() {
    //first two characters "Ox" are deleted + 1 character to make it invalid
    this.params = {
        privateKey: ethers.Wallet.createRandom().privateKey.slice(3)
    }
})


When('sends a Post request to the path {string} without ethereum privkey', async function (string) {
    try {
        this.response = await make_post(string, this.params)
    } catch (err) {
        this.response = err.response
    }
});

When('sends a Post request to the path {string} with an ethereum privkey', async function (string) {
    try {
        this.response = await make_post(string, this.params)
    } catch (err) {
        this.response = err.response
    }
});

When('sends a Post request to the path {string} with a valid token', async function (string) {
    try {
        this.response = await make_post(string, this.params)
    } catch (err) {
        this.response = err.response
    }
});

When('sends a Post request to the path {string} with an invalid token', async function (string) {
    try {
        //slice 1 character from token to make it invalid
        this.params.api_token = this.params.api_token.slice(1)
        this.response = await make_post(string, this.params)
    } catch (err) {
        this.response = err.response
    }
});

Then ('gets a response with code {int}', function(int) {
    assert.equal(this.response.status, int)
});

Then ('gets an error response with code {int}', function(int) {
    assert.equal(this.response.response.status, int)
});

Then ('response error message {string}', function(string) {
    assert.equal(this.response.response.data, string)
});

Then('status {string}', function (string) {
    assert.equal(this.response.data.status, string)
});

Then('the deleted token', function () {
    assert.equal(this.response.data.data.deleted_token, this.params.api_token)
});

Then('a valid api_token, ethereum_keypar and iota_id', function () {
    assert(this.response.data.data.api_token!=undefined)
    assert(this.response.data.data.eth_priv_key!=undefined)
    assert(this.response.data.data.eth_pub_key!=undefined)
    assert(this.response.data.data.iota_id!=undefined)
});

Then('a valid api_token, the given ethereum_keypar and iota_id', function () {
    assert(this.response.data.data.api_token!=undefined)
    //console.log("privkeyreturn: ",this.response.data.data.eth_priv_key.slice(2))
    //console.log("privkeysteps: ",this.params.privateKey)
    assert(this.response.data.data.eth_priv_key.slice(2)==this.params.privateKey)
    assert(this.response.data.data.eth_pub_key!=undefined)
    assert(this.response.data.data.iota_id!=undefined)
});

async function make_post(route, params) {
    try {
        return await axios.post(`${api_url}/${route}`, params, {
            headers: {
                dlt: "ethereum"
            }
        })
    }
    catch (err) {
        return err
    }
}
