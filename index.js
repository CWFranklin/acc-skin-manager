require('dotenv').config()
const express = require('express')
const cookieParser = require('cookie-parser')
const pug = require('pug')
const multer  = require('multer')

const connect = require('./db')
const { adminAuth, discordAuth, userAuth } = require('./routes/auth')
const { adminIndex, whitelistAdd, whitelistRemove } = require('./routes/admin')
const { dashboardIndex, bulkSkinDownload, skinAdd, skinDownload, skinRemove } = require('./routes/dashboard')


// Initialise DB
const cars = require('./data/cars.json')
const migrations = require('./data/migrations.json')
const adminId = process.env.ADMIN_ID

async function initDB() {
    const conn = await connect()

    for (const [name, sql] of Object.entries(migrations)) {
        console.log(`Running ${name} migration...`)
        await conn.query(sql)
        console.log(`${name} migration successfully run!`)
    }

    for (const [name, modelType] of Object.entries(cars)) {
        console.log(`Inserting ${name}...`)
        await conn.query('INSERT INTO cars (name, model_type) VALUES(?, ?) ON DUPLICATE KEY UPDATE name = ?', [name, modelType, name])
        console.log(`${name} upserted successfully!`)
    }

    if (adminId) {
        console.log(`Whitelisting admin ${adminId}...`)
        await conn.query('INSERT IGNORE INTO whitelist (discord_id) VALUES (?)', [adminId])
        console.log(`Admin ${adminId} whitelisted successfully!`)
    }
}

initDB()


// Create server
const PORT = process.env.PORT || 3000
const app = express()
const upload = multer({ dest: 'uploads/' })
app.set('view engine', 'pug')
app.use(cookieParser())
app.use(express.static('public'))

app.use((req, res, next) => {
    res.locals.orgName = process.env.ORG_NAME
    next()
})

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})

app.get('/', async (req, res) => {
    const conn = await connect()
    const [ skins, fields ] = await conn.query('SELECT * FROM skins')

    const discordClientID = process.env.DISCORD_CLIENT_ID
    const discordRedirectURI = process.env.DISCORD_REDIRECT_URI
    const discordRedirect = `https://discord.com/api/oauth2/authorize?client_id=${discordClientID}&redirect_uri=${encodeURIComponent(discordRedirectURI)}&response_type=code&scope=identify`

    res.render('index', { skinCount: skins.length, discordRedirect })
})

app.get('/auth/discord', discordAuth)

app.get('/admin', adminAuth, adminIndex)
app.post('/admin/whitelist', adminAuth, whitelistAdd)
app.get('/admin/whitelist/delete', adminAuth, whitelistRemove)

app.get('/dashboard', userAuth, dashboardIndex)
app.get('/dashboard/download', userAuth, bulkSkinDownload)

const skinUpload = upload.fields([{ name: 'car-file', maxCount: 1 }, { name: 'skin-files', maxCount: 6 }])
app.post('/dashboard/skins', skinUpload, userAuth, skinAdd)
app.get('/dashboard/skins/:id', userAuth, skinDownload)
app.get('/dashboard/skins/:id/delete', userAuth, skinRemove)
