const archiver =  require('archiver')
const fs = require('fs')
const path = require('path')

const connect = require('../db')
const { currentUser } = require('./auth')

exports.dashboardIndex = async (req, res) => {
    const userId = currentUser(req).userId
    const conn = await connect()

    try {
        const [ skins, fields ] = await conn.query('SELECT s.id, s.name, c.name AS car_name FROM skins s LEFT JOIN cars c ON s.car_id = c.id WHERE s.user_id = ?', [userId])
        return res.render('dashboard', { skins, uploaded: req.query.uploaded, deleted: req.query.deleted })
    } catch (error) {
        console.log(`Error fetching skins for user ${userId} from DB`)
    }

    return res.send('Unable to retrieve skins!')
}

exports.bulkSkinDownload = async (req, res) => {
    const conn = await connect()
    const orgName = process.env.ORG_NAME
    let latestTimestamp

    try {
        const [result, fields] = await conn.query('SELECT MAX(UNIX_TIMESTAMP(uploaded_at)) AS latest_timestamp FROM skins')
        latestTimestamp = result[0].latest_timestamp
    } catch (error) {
        console.log('Error fetching latest uploaded_at timestamp:', error)
    }

    const filePath = `./compiled/${orgName}-ACCSkins-${latestTimestamp}.zip`

    try {
        if (fs.existsSync(filePath)) {
            return res.download(filePath)
        }
    } catch (error) {
        console.log('Error downloading file:', error)
        return res.send('Unable to download file!')
    }

    try {
        // Clean up old bundles
        const compiledDirectory = './compiled'

        fs.readdir(compiledDirectory, (err, files) => {
            if (err) throw err

            for (const file of files) {
                if (file.startsWith(`${orgName}-ACCSkins-`) && file.endsWith('.zip')) {
                    fs.unlink(path.join(compiledDirectory, file), err => {
                        if (err) throw err
                    })
                }
            }
        })
    } catch (error) {
        console.log('Error deleting old bundle ZIP files:', error)
    }

    try {
        const archive = archiver('zip', { zlib: { level: 9 }})
        const output = fs.createWriteStream(filePath)

        output.on('close', function() {
            return res.download(filePath)
        })

        archive.on('error', function(err) {
            throw err
        })

        archive.pipe(output)

        // loop through ./skins directory and add each Cars and Liveries folder to the archive
        const skinsPath = './skins'
        const skins = fs.readdirSync(skinsPath).filter(file => {
            return fs.statSync(path.join(skinsPath, file)).isDirectory()
        })

        for (const skin of skins) {
            archive.directory(`./skins/${skin}/Cars`, 'Cars')
            archive.directory(`./skins/${skin}/Liveries`, 'Liveries')
        }

        archive.finalize()
    } catch (error) {
        console.log(`Error creating skins bundle`)
        return res.send('Unable to compile skins!')
    }
}

exports.skinDownload = async (req, res) => {
    const skinId = req.params.id
    let folderName

    try {
        const liveriesPath = `./skins/${skinId}/liveries`
        const folders = fs.readdirSync(liveriesPath).filter(file => {
            return fs.statSync(path.join(liveriesPath, file)).isDirectory()
        })

        if (folders.length !== 1) {
            console.log('Error: Expected only one folder inside liveries directory')
            return
        }

        folderName = folders[0]
    } catch (error) {
        console.log(`Error fetching skin name for skin ${skinId}`)
    }

    try {
        const archive = archiver('zip', { zlib: { level: 9 }})
        const output = fs.createWriteStream(`./compiled/${folderName}.zip`)

        output.on('close', function() {
            return res.download(`./compiled/${folderName}.zip`)
        })

        archive.on('error', function(err) {
            throw err
        })

        archive.pipe(output)

        archive.directory(`./skins/${skinId}/Cars`, 'Cars')
        archive.directory(`./skins/${skinId}/Liveries`, 'Liveries')

        archive.finalize()
    } catch (error) {
        console.log(`Error downloading skin ${skinId}`)
        return res.send('Unable to download skin!')
    }
}

exports.skinAdd = async (req, res) => {
    const userId = currentUser(req).userId
    const conn = await connect()

    const carFile = req.files['car-file'][0]
    const carPath = carFile.path
    let carObj

    try {
        carObj = JSON.parse(fs.readFileSync(carPath, 'utf-16le'))
    } catch (error) {
        console.log(`Car JSON file ${carPath} is not UTF-16LE encoded. Trying UTF-8...`)
    }

    if (! carObj) {
        try {
            carObj = JSON.parse(fs.readFileSync(carPath, 'utf-8'))
        } catch (error) {
            console.log(`Car JSON file ${carPath} is not UTF-8 encoded`)
            return res.send('Unable to parse car JSON file! Please try a different encoding. We support UTF-16LE and UTF-8.')
        }
    }

    const modelType = carObj.carModelType
    const carName = carObj.customSkinName

    let carId
    let skinId

    if (carFile.mimetype !== 'application/json') {
        return res.send('Nice try. Only JSON files here please.')
    }

    for (const [key, file] of Object.entries(req.files['skin-files'])) {
        if (file.mimetype !== 'image/png' && file.mimetype !== 'application/json') {
            return res.send('Nice try. Only JSON/PNG files here please.')
        }
    }

    try {
        const [ car, fields ] = await conn.query('SELECT id FROM cars WHERE model_type = ?', [modelType])

        if (car.length === 0) {
            return res.send('Car not found! Please contact the admin to add this car to the database.')
        } else {
            carId = car[0].id
        }
    } catch (error) {
        console.log(`Error fetching car ${modelType} from DB`)
    }

    try {
        const [ addSkin, unknown ] = await conn.query('INSERT INTO skins (user_id, car_id, name) VALUES(?, ?, ?)', [userId, carId, req.body.name])
        skinId = addSkin.insertId
    } catch (error) {
        console.log(`Error adding skin to DB for user ${userId}`)
    }

    try {
        fs.mkdirSync(`./skins/${skinId}/Cars`, { recursive: true })
        fs.mkdirSync(`./skins/${skinId}/Liveries/${carName}`, { recursive: true })
    } catch (error) {
        console.log(`Error creating skin directories for car ${skinId}`)
    }

    try {
        fs.renameSync(carPath, `./skins/${skinId}/Cars/${carFile.originalname}`)

        for (const [key, file] of Object.entries(req.files['skin-files'])) {
            fs.renameSync(file.path, `./skins/${skinId}/Liveries/${carName}/${file.originalname}`)
        }
    } catch (error) {
        console.log(`Error moving skin files for car ${skinId}`)
    }

    res.redirect('/dashboard?uploaded=true')
}

exports.skinRemove = async (req, res) => {
    const userId = currentUser(req).userId
    const skinId = req.params.id
    const conn = await connect()

    try {
        const [ skin, fields ] = await conn.query('SELECT * FROM skins WHERE id = ?', [skinId])

        if (skin.length === 0) {
            return res.redirect('/dashboard?deleted=false')
        }

        if (skin[0].user_id !== userId) {
            return res.redirect('/dashboard?deleted=false')
        }
    } catch (error) {
        console.log(`Error fetching skin ${skinId} from DB`)
    }

    try {
        await conn.query('DELETE FROM skins WHERE id = ?', [skinId])
    } catch (error) {
        console.log(`Error deleting skin ${skinId} from DB`)
    }

    try {
        fs.rmSync(`./skins/${skinId}`, { recursive: true })
    } catch (error) {
        console.log(`Error removing skin ${skinId} from filesystem`)
    }

    res.redirect('/dashboard?deleted=true')
}
