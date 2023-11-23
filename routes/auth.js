const axios = require('axios')
const jwt = require('jsonwebtoken')
const parsePlaceholders = require('named-placeholders')()

const connect = require('../db')

const jwtSecret = process.env.JWT_SECRET
const jwtMaxAge = process.env.JWT_MAX_AGE

exports.currentUser = (req) => {
    const token = req.cookies.jwt
    if (token) {
        return jwt.verify(token, jwtSecret, (err, decodedToken) => {
            if (err) {
                console.log(err.message)
                return null
            } else {
                if (!decodedToken.id) {
                    return null
                } else {
                    return decodedToken
                }
            }
        })
    } else {
        return null
    }
}

exports.userAuth = (req, res, next) => {
    const token = req.cookies.jwt
    if (token) {
        jwt.verify(token, jwtSecret, (err, decodedToken) => {
            if (err) {
                console.log(err.message)
                res.redirect('/')
            } else {
                if (!decodedToken.id) {
                    return res.status(401).json({ message: 'Not authorized' })
                } else {
                    next()
                }
            }
        })
    } else {
        return res.status(401).json({ message: 'Not authorized' })
    }
}

exports.adminAuth = (req, res, next) => {
    const token = req.cookies.jwt
    if (token) {
        jwt.verify(token, jwtSecret, (err, decodedToken) => {
            if (err) {
                console.log(err.message)
                res.redirect('/')
            } else {
                if (decodedToken.admin !== true) {
                    return res.status(401).json({ message: 'Not authorized' })
                } else {
                    next()
                }
            }
        })
    } else {
        return res.status(401).json({ message: 'Not authorized' })
    }
}

exports.discordAuth = async (req, res) => {
    const code = req.query.code
    const params = new URLSearchParams()

    let user

    params.append('client_id', process.env.DISCORD_CLIENT_ID)
    params.append('client_secret', process.env.DISCORD_CLIENT_SECRET)
    params.append('grant_type', 'authorization_code')
    params.append('code', code)
    params.append('redirect_uri', process.env.DISCORD_REDIRECT_URI)

    try {
        const response = await axios.post('https://discord.com/api/oauth2/token', params)
        const { access_token, token_type } = response.data

        const userDataResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: {
                authorization: `${token_type} ${access_token}`
            }
        })

        console.log('Data: ', userDataResponse.data)
        user = {
            id: userDataResponse.data.id,
            username: userDataResponse.data.username,
            avatar: userDataResponse.data.avatar,
        }

        const conn = await connect()
        let token = null

        const [ existingUsers, fields ] = await conn.execute('SELECT * FROM users WHERE discord_id = ?', [user.id])

        if (existingUsers.length > 0) {
            existingUser = existingUsers[0]
            token = jwt.sign(
                { id: user.id, userId: existingUser.id, username: user.username, admin: process.env.ADMIN_ID === user.id },
                jwtSecret,
                { expiresIn: jwtMaxAge }
            )

            if (existingUser.username !== user.username || existingUser.avatar !== user.avatar) {
                await conn.execute('UPDATE users SET username = ?, avatar = ? WHERE id = ?', [user.username, user.avatar, existingUser.id])
            }
        } else {
            const [ whitelistUsers, fields ] = await conn.execute('SELECT * FROM whitelist WHERE discord_id = ?', [user.id])

            if (whitelistUsers.length > 0) {
                const userInsert = await conn.query('INSERT INTO users (discord_id, username, avatar) VALUES (?, ?, ?)', [ user.id, user.username, user.avatar ])

                token = jwt.sign(
                    { id: user.id, userId: userInsert.insertId, username: user.username, admin: process.env.ADMIN_ID === user.id },
                    jwtSecret,
                    { expiresIn: jwtMaxAge }
                )
            }
        }

        if (token !== null) {
            res.cookie('jwt', token, { httpOnly: true, maxAge: jwtMaxAge })
            res.redirect('/dashboard')
        } else {
            res.redirect('/')
        }
    } catch (error) {
        console.log('Error', error)
        return res.send('Some error occurred!')
    }
}
