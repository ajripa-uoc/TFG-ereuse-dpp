const axios = require("axios")
const api_url = process.env.API_CONNECTOR_URL || "http://api_connector:3010"
const route = "oracle"
const ADMIN_TOKEN = process.env.ADMIN_TOKEN
const VERAMO_API_CRED = process.env.VERAMO_API_CRED
const params= {
    api_token: ADMIN_TOKEN,
    Credential: JSON.parse(VERAMO_API_CRED)
}
const dlt = "ethereum"
axios.post(`${api_url}/${route}`, params, {
    headers: {
        dlt: dlt
    }
}).then(response => {
    // TODO less logs
    console.error(response.data)
}

)
