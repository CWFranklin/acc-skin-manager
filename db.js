const mysql = require('mysql2/promise')

async function connect() {
    try {
        return await mysql.createConnection({
            host: process.env.MYSQL_HOST,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASS,
            database: process.env.MYSQL_DB,
        })
    } catch (err) {
        console.log('Error connecting to the database: ', err)
        throw err
    }
}

module.exports = connect
