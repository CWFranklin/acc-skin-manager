const connect = require('../db')
const { currentUser } = require('./auth')

exports.dashboardIndex = async (req, res) => {
    const userId = currentUser(req)
    const conn = await connect()
    const [ skins, fields ] = await conn.query('SELECT * FROM skins WHERE user_id = ?', [userId])
    res.render('dashboard', { skins })
}

exports.skinDownload = async (req, res) => {
    //
}

exports.skinAdd = async (req, res) => {
    //
}

exports.skinRemove = async (req, res) => {
    //
}
