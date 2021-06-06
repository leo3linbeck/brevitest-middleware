const axios = require('axios');

axios.defaults.baseURL = process.env.COUCHDB_URL;
axios.defaults.headers.common['Authorization'] = process.env.COUCHDB_BASE64_AUTH;

const ARG_DELIM = ',';
const ATTR_DELIM = ':';
const ITEM_DELIM = '|';
const END_DELIM = "#";

const getStatus = (status) => status === 200 || status === 304;
const verifyStatus = (status) => status === 200 || status === 404;
const putStatus = (status) => status === 201 || status === 202;
const postStatus = (status) => status === 200 || status === 201;

const saveDocument = (doc) => {
    const config = {
        validateStatus: putStatus
    };
    return axios.put(`/${doc._id}`, { ...doc }, config).then((response) => {
        return { ...doc, _rev: response.data.rev }
    });
};

const getDocument = (docId) => {
    const config = {
        params: { include_docs: true },
        validateStatus: getStatus
    };
    return axios.get(`/${docId}`, config);
};

const documentExists = (docId) => {
    const config = {
        params: { include_docs: true },
        validateStatus: verifyStatus
    };
    return axios.get(`/${docId}`, config)
};

const getCartridgeWithBarcode = (barcode) => {
    const config = {
        params: { include_docs: true, key: `"${barcode}"` },
        validateStatus: getStatus
    };
    return axios
        .get(`/_design/cartridges/_view/barcode`, config)
        .then((response) => {
            const rows = response.data.rows;
            if (!rows) {
                throw new Error(`Missing data for barcode ${barcode}`);
            } else if (rows.length === 0) {
                throw new Error(`Barcode ${barcode} not found in database`);
            } else if (rows.length > 1) {
                throw new Error(`${rows.length} records for ${barcode} found - only 1 allowed`);
            }
            return  rows[0].doc;
        });
};

const getCartridgeWithSerialNumber = (serialNumber) => {
    const config = {
        params: { include_docs: true, key: `"${serialNumber}"` },
        validateStatus: getStatus
    };
    return axios
        .get(`/_design/cartridges/_view/serialNumber`, config)
        .then((response) => {
            const rows = response.data.rows;
            if (!rows) {
                throw new Error(`Missing data for serial number ${serialNumber}`);
            } else if (rows.length === 0) {
                throw new Error(`Serial Number ${serialNumber} not found in database`);
            } else if (rows.length > 1) {
                throw new Error(`${rows.length} records for ${serialNumber} found - only 1 allowed`);
            }
            return  rows[0].doc;
        });
};

const getMultipleDocuments = (keys) => {
    const config = {
        params: { include_docs: true },
        validateStatus: postStatus
    };
    return axios
        .post(`/_all_docs`, { keys },  config)
        .then((response) => {
            const rows = response.data.rows;
            if (rows.length !== keys.length) {
                const rowKeys = rows.map((row) => row.key);
                throw new Error(`Document mismatch: searched for (${keys.join(',')}) and found (${rowKeys.join(',')})`);
            }
            return rows.map((row) => row.doc);
        });
};

const bcodeCommands = [{
	num: '0',
	name: 'START TEST',
	params: [],
	description: 'Starts the test. Required to be the first command. Test executes until Finish Test command.'
}, {
	num: '1',
	name: 'DELAY',
	params: ['delay_ms'],
	description: 'Waits for specified number of milliseconds.'
}, {
	num: '2',
	name: 'MOVE MICRONS',
	params: ['microns', 'step_delay_us'],
	description: 'Moves the stage a specified number of microns at a specified speed expressed as a step delay in microseconds.'
}, {
	num: '3',
	name: 'OSCILLATE STAGE',
	params: ['microns', 'step_delay_us', 'cycles'],
	description: 'Oscillates back and forth a given distance at a specified speed expressed as a step delay in microseconds.'
}, {
	num: '4',
	name: 'BUZZ',
	params: ['duration_ms', 'frequency'],
	description: 'Turns on the buzzer for a specified number of milliseconds at a specified frequency.'
}, {
	num: '10',
	name: 'READ SENSORS',
	params: [],
	description: 'Takes readings from the sensors.'
}, {
	num: '11',
	name: 'READ SENSORS WITH PARAMETERS',
	params: ['param','led_power'],
	description: 'Read sensors with input parameters.'
}, {
	num: '12',
	name: 'SET BASELINE AND READ SENSORS',
	params: ['number_of_readings'],
	description: 'Set LED power baselines and read sensors a specified number of times.'
}, {
	num: '13',
	name: 'READ SENSORS WITH BASELINE',
	params: ['number_of_readings'],
	description: 'Read sensors a specified number of times.'
}, {
	num: '13',
	name: 'READ SENSOR MULTIPLE TIMES',
	params: ['number_of_readings'],
	description: 'Read sensors a specified number of times.'
}, {
	num: '14',
	name: 'READ SENSORS MULTIPLE TIMES WITH PAUSE',
	params: ['number_of_readings', 'pause_ms'],
	description: 'Read sensors a specified number of times with a pause between reads.'
}, {
	num: '15',
	name: 'SET BASELINE TIME',
	params: ['number_of_readings'],
	description: 'Set time of baseline readings to current timestamp.'
}, {
	num: '20',
	name: 'REPEAT',
	params: ['count'],
	description: 'Repeats the block of BCODE.'
}, {
	num: '98',
    name: 'COMMENT',
    params: ['text'],
    description: 'Comment - ignored by system.'
  }, {
	num: '99',
	name: 'FINISH TEST',
	params: [],
	description: 'Finishes the test. Required to be the final command.'
}];

const getBcodeCommand = (command) => {
	return bcodeCommands.find(e => e.name === command);
};

const instructionTime = (command, params) => {
    // jscs:disable requireCamelCaseOrUpperCaseIdentifiers
	switch (command) {
        case 'DELAY': // delay
            return parseInt(params.delay_ms, 10);
        case 'MOVE MICRONS': // move microns
            return Math.floor(2 * Math.abs(parseInt(params.microns, 10)) * parseInt(params.step_delay_us, 10) / 25000);
        case 'OSCILLATE STAGE': // oscillate
            return Math.floor(4 * parseInt(params.cycles, 10) * Math.abs(parseInt(params.microns, 10)) * parseInt(params.step_delay_us, 10) / 25000);
        case 'BUZZ': // buzz the buzzer
            return parseInt(params.duration_ms, 10);
        case 'READ SENSORS': // read Sensors
        case 'READ SENSORS WITH PARAMETERS':
            return 10000;
        case 'SET BASELINE AND READ SENSORS': // read Sensors
            return 5000 * parseInt(params.number_of_readings, 10) + 10000;
        case 'READ SENSORS WITH BASELINE':
        case 'READ SENSOR MULTIPLE TIMES':
            return 5000 * parseInt(params.number_of_readings, 10);
        case 'READ SENSORS MULTIPLE TIMES WITH PAUSE':
            return (5000 + params.pause_ms) * parseInt(params.number_of_readings, 10);
        case 'SET BASELINE TIME': // startup sequence
            return 10;
        case 'START TEST': // startup sequence
            return 9000;
        case 'FINISH TEST': // cleanup sequence
            return 8000;
	}
	// jscs:enable requireCamelCaseOrUpperCaseIdentifiers
	return 0;
};

const bcodeDuration = (bcodeArray) => {
    const total_duration = bcodeArray.reduce((duration, bcode) => {
        const cmd = bcode.command.toUpperCase();
        if (cmd === 'REPEAT') {
            return duration + bcodeDuration(bcode.code) * parseInt(bcode.count, 10);
        } else {
            return duration + instructionTime(cmd, bcode.params);
        }
    }, 0);

    return parseInt(total_duration, 10);
};

const compileInstruction = (cmd, args) => {
    const command = getBcodeCommand(cmd);
    const keys = Object.keys(args);
	const argKeys = keys.length ? keys.filter(k => k.toLowerCase() !== 'comment') : [];  // remove comments
	if (command.params.length !== argKeys.length) {
		throw new Error(`Parameter count mismatch, command: ${cmd} should have ${command.params.length}, has ${argKeys.length}`);
    }
    if (command.params.length) {
        return command.params.reduce((result, param) => `${result}${ARG_DELIM}${args[param]}`, command.num) + ATTR_DELIM;
    } else {
        return command.num + ATTR_DELIM;
    }
};

const compileRepeatBegin = (count) => {
	return `20,${count}${ATTR_DELIM}`;
};

const compileRepeatEnd = () => {
	return `21${ATTR_DELIM}`;
};

const bcodeCompile = (bcodeArray) => {
    return bcodeArray.reduce((compiledCode, bcode) => {
        const cmd = bcode.command.toUpperCase();
        if (cmd === 'COMMENT') {
            return compiledCode;
        } else if (cmd === 'REPEAT') {
            return compiledCode + compileRepeatBegin(bcode.count) + bcodeCompile(bcode.code) + compileRepeatEnd();
        } else {
            return compiledCode + compileInstruction(cmd, bcode.params);
        }
    }, '');
};

const crc32tab = [
	0x00000000, 0x77073096, 0xee0e612c, 0x990951ba,
	0x076dc419, 0x706af48f, 0xe963a535, 0x9e6495a3,
	0x0edb8832, 0x79dcb8a4, 0xe0d5e91e, 0x97d2d988,
	0x09b64c2b, 0x7eb17cbd, 0xe7b82d07, 0x90bf1d91,
	0x1db71064, 0x6ab020f2, 0xf3b97148, 0x84be41de,
	0x1adad47d, 0x6ddde4eb, 0xf4d4b551, 0x83d385c7,
	0x136c9856, 0x646ba8c0, 0xfd62f97a, 0x8a65c9ec,
	0x14015c4f, 0x63066cd9, 0xfa0f3d63, 0x8d080df5,
	0x3b6e20c8, 0x4c69105e, 0xd56041e4, 0xa2677172,
	0x3c03e4d1, 0x4b04d447, 0xd20d85fd, 0xa50ab56b,
	0x35b5a8fa, 0x42b2986c, 0xdbbbc9d6, 0xacbcf940,
	0x32d86ce3, 0x45df5c75, 0xdcd60dcf, 0xabd13d59,
	0x26d930ac, 0x51de003a, 0xc8d75180, 0xbfd06116,
	0x21b4f4b5, 0x56b3c423, 0xcfba9599, 0xb8bda50f,
	0x2802b89e, 0x5f058808, 0xc60cd9b2, 0xb10be924,
	0x2f6f7c87, 0x58684c11, 0xc1611dab, 0xb6662d3d,
	0x76dc4190, 0x01db7106, 0x98d220bc, 0xefd5102a,
	0x71b18589, 0x06b6b51f, 0x9fbfe4a5, 0xe8b8d433,
	0x7807c9a2, 0x0f00f934, 0x9609a88e, 0xe10e9818,
	0x7f6a0dbb, 0x086d3d2d, 0x91646c97, 0xe6635c01,
	0x6b6b51f4, 0x1c6c6162, 0x856530d8, 0xf262004e,
	0x6c0695ed, 0x1b01a57b, 0x8208f4c1, 0xf50fc457,
	0x65b0d9c6, 0x12b7e950, 0x8bbeb8ea, 0xfcb9887c,
	0x62dd1ddf, 0x15da2d49, 0x8cd37cf3, 0xfbd44c65,
	0x4db26158, 0x3ab551ce, 0xa3bc0074, 0xd4bb30e2,
	0x4adfa541, 0x3dd895d7, 0xa4d1c46d, 0xd3d6f4fb,
	0x4369e96a, 0x346ed9fc, 0xad678846, 0xda60b8d0,
	0x44042d73, 0x33031de5, 0xaa0a4c5f, 0xdd0d7cc9,
	0x5005713c, 0x270241aa, 0xbe0b1010, 0xc90c2086,
	0x5768b525, 0x206f85b3, 0xb966d409, 0xce61e49f,
	0x5edef90e, 0x29d9c998, 0xb0d09822, 0xc7d7a8b4,
	0x59b33d17, 0x2eb40d81, 0xb7bd5c3b, 0xc0ba6cad,
	0xedb88320, 0x9abfb3b6, 0x03b6e20c, 0x74b1d29a,
	0xead54739, 0x9dd277af, 0x04db2615, 0x73dc1683,
	0xe3630b12, 0x94643b84, 0x0d6d6a3e, 0x7a6a5aa8,
	0xe40ecf0b, 0x9309ff9d, 0x0a00ae27, 0x7d079eb1,
	0xf00f9344, 0x8708a3d2, 0x1e01f268, 0x6906c2fe,
	0xf762575d, 0x806567cb, 0x196c3671, 0x6e6b06e7,
	0xfed41b76, 0x89d32be0, 0x10da7a5a, 0x67dd4acc,
	0xf9b9df6f, 0x8ebeeff9, 0x17b7be43, 0x60b08ed5,
	0xd6d6a3e8, 0xa1d1937e, 0x38d8c2c4, 0x4fdff252,
	0xd1bb67f1, 0xa6bc5767, 0x3fb506dd, 0x48b2364b,
	0xd80d2bda, 0xaf0a1b4c, 0x36034af6, 0x41047a60,
	0xdf60efc3, 0xa867df55, 0x316e8eef, 0x4669be79,
	0xcb61b38c, 0xbc66831a, 0x256fd2a0, 0x5268e236,
	0xcc0c7795, 0xbb0b4703, 0x220216b9, 0x5505262f,
	0xc5ba3bbe, 0xb2bd0b28, 0x2bb45a92, 0x5cb36a04,
	0xc2d7ffa7, 0xb5d0cf31, 0x2cd99e8b, 0x5bdeae1d,
	0x9b64c2b0, 0xec63f226, 0x756aa39c, 0x026d930a,
	0x9c0906a9, 0xeb0e363f, 0x72076785, 0x05005713,
	0x95bf4a82, 0xe2b87a14, 0x7bb12bae, 0x0cb61b38,
	0x92d28e9b, 0xe5d5be0d, 0x7cdcefb7, 0x0bdbdf21,
	0x86d3d2d4, 0xf1d4e242, 0x68ddb3f8, 0x1fda836e,
	0x81be16cd, 0xf6b9265b, 0x6fb077e1, 0x18b74777,
	0x88085ae6, 0xff0f6a70, 0x66063bca, 0x11010b5c,
	0x8f659eff, 0xf862ae69, 0x616bffd3, 0x166ccf45,
	0xa00ae278, 0xd70dd2ee, 0x4e048354, 0x3903b3c2,
	0xa7672661, 0xd06016f7, 0x4969474d, 0x3e6e77db,
	0xaed16a4a, 0xd9d65adc, 0x40df0b66, 0x37d83bf0,
	0xa9bcae53, 0xdebb9ec5, 0x47b2cf7f, 0x30b5ffe9,
	0xbdbdf21c, 0xcabac28a, 0x53b39330, 0x24b4a3a6,
	0xbad03605, 0xcdd70693, 0x54de5729, 0x23d967bf,
	0xb3667a2e, 0xc4614ab8, 0x5d681b02, 0x2a6f2b94,
	0xb40bbe37, 0xc30c8ea1, 0x5a05df1b, 0x2d02ef8d
];

const checksum = (str) => {
    let crc = ~0, i, l;
    for (i = 0, l = str.length; i < l; i++) {
        crc = (crc >>> 8) ^ crc32tab[(crc ^ str.charCodeAt(i)) & 0xff];
    }
    crc = Math.abs(crc ^ -1);
    return crc;
};

const generateResponseString = (serialNumber, code) => {
    const bcodeVersion = 3;
    const compiledBCODE =  bcodeCompile(code);
    const duration = parseInt(bcodeDuration(code) / 1000, 10);
    const result = [
        serialNumber,
        bcodeVersion,
        checksum(compiledBCODE),
        duration,
        compiledBCODE.length,
        compiledBCODE
    ];

    return result.join(ITEM_DELIM);
};

const verify_device = (callback, coreId, deviceId) => {
    if (coreId !== deviceId) {
        send_response(callback, deviceId, 'verify-device', 'FAILURE', `Device ID mismatch (${coreId} vs. ${deviceId})`);
    } else {
        getDocument(deviceId)
            .then ((response) => {
                const device = response.data;
                if (!device.validated) {
                    send_response(callback, deviceId, 'verify-device', 'FAILURE', 'Device not validated');
                } else {
                    device.verified = true;
                    device.lastActiveOn = device.lastVerifiedOn = new Date();
                    return saveDocument(device);    
                }
            })
            .then(() => {
                send_response(callback, deviceId, 'verify-device', 'SUCCESS', deviceId);
            })
            .catch((error) => {
                if (error.message) {
                    send_response(callback, deviceId, 'verify-device', 'FAILURE', error.message);
                } else {
                    send_response(callback, deviceId, 'verify-device', 'ERROR', deviceId);
                }
            });
    }
};

const loadCartridge = (barcode) => {
    return documentExists(barcode)
        .then((response) => {
            if (response.status == 200) {
                return response.data;
            } else {
                return getCartridgeWithBarcode(barcode);
            }
        });
};

const validate_cartridge = (callback, deviceId, barcode) => {
	if (!barcode) {
        send_response(callback, deviceId, 'validate-cartridge', 'FAILURE', `Barcode missing`);
    } else if (!deviceId) {
        send_response(callback, deviceId, 'validate-cartridge', 'FAILURE', `Device ID missing`);
    } else {
        let cartridge = null;
        loadCartridge(barcode)
            .then((c) => {
                cartridge = c;
                if (!cartridge) {
                    throw new Error(`Cartridge ${cartridge._id} missing, may be deleted`);
                } else if (cartridge.used) {
                    throw new Error(`Cartridge ${cartridge._id} already used`);
                } else if (cartridge.status !== 'linked') {
                    throw new Error(`Cartridge ${cartridge._id} is not linked to a sample`);
                } else if (cartridge.sample && cartridge.sample.type === 'clinical' && !cartridge.order) {
                    throw new Error(`Cartridge ${cartridge._id} is a clinical test but is not linked to an order`);
                // } else if (((new Date() -  new Date(cartridge.linkDate)) / 1000) > 1800) {
                //     throw new Error(`Cartridge ${cartridge._id} cannot be used because it has been more than 30 minutes since it was linked`);
                // } else if (!cartridge.orderId) {
                //     throw new Error(`Cartridge ${cartridge._id} is missing an order number`);
                } else if (!cartridge.siteId) {
                    throw new Error(`Cartridge ${cartridge._id} is not assigned to a site`);
                } else if (cartridge._id.length === 36 && !cartridge.serialNumber) {
                    throw new Error(`Cartridge ${cartridge._id} is missing a serial number`);
                }
                const assayId = cartridge._id.length === 24 ? cartridge._id.slice(0, 8) : cartridge.serialNumber.slice(0, 8);
                return getMultipleDocuments([deviceId, assayId]);
            })
            .then(([device, assay]) => {
                // const device = docs[0];
                // const assay = docs[1];
                if (!device.verified) {
                    throw new Error(`Device ${device.name} not verified`);
                }
                if (cartridge.siteId !== device.siteId) {
                    throw new Error(`Cartridge site ${cartridge.siteId} does not match device site ${device.siteId}`);
                }
                const cartSN = cartridge._id.length === 24 ? cartridge._id : cartridge.serialNumber;
                const responseString = generateResponseString(cartSN, assay.BCODE.code);
                send_response(callback, deviceId, 'validate-cartridge', 'SUCCESS', responseString);
            })
            .catch((error) => {
                if (error)
                if (error.message) {
                    send_response(callback, deviceId, 'validate-cartridge', 'FAILURE', error.message);
                } else {
                    send_response(callback, deviceId, 'validate-cartridge', 'ERROR', deviceId);
                }
            });
    }
};

const test_start = (callback, deviceId, serialNumber) => {
    if (!serialNumber) {
        throw new Error(`FAILURE: Cartridge ID is missing.`);
    }

    let cartridge = null;
    getCartridgeWithSerialNumber(serialNumber)
        .then((c) => {
            cartridge = c;
            const assayId = cartridge._id.length === 24 ? cartridge._id.slice(0, 8) : cartridge.serialNumber.slice(0, 8);
            return getMultipleDocuments([deviceId, assayId]);
        })
        .then (([device, assay]) => {
            const when = new Date().toISOString().slice(0, 19);
            const who = 'brevitest-cloud';
            const where = device.location;
            cartridge.device = device;
            cartridge.assay = assay;
            cartridge.assay.duration = parseInt(bcodeDuration(assay.BCODE.code) / 1000, 10);
            cartridge.status = 'underway';
            cartridge.used = true;
            cartridge.checkpoints.underway = { when, who, where };
            cartridge.statusUpdatedOn = when;
            return saveDocument(cartridge);
        })
        .then((doc) => {
            send_response(callback, deviceId, 'start-test', 'SUCCESS', serialNumber);
        })
        .catch((error) => {
            if (error.message) {
                send_response(callback, deviceId, 'start-test', 'FAILURE', error.message);
            } else {
                error.serialNumber = serialNumber;
                send_response(callback, deviceId, 'start-test', 'ERROR', error);
            }
        });
};

const parseReadingABFormat = (reading) => {
	const args = reading.split(ARG_DELIM);
    const channel = args[0];
    const x = parseInt(args[1], 16);
    const y = parseInt(args[2], 16);
    const z = parseInt(args[3], 16);
    const L = Math.round(Math.sqrt(x * x + y * y + z * z));
    const temperature = parseInt(args[4], 16);
    return { channel, x, y, z, L, temperature };
};

const parseReadingCFormat = (reading) => {
	const args = reading.split(ARG_DELIM);
    const channel = args[0];
    const samples = parseInt(args[1], 16);
    const time = parseInt(args[2], 16);
    const x = parseInt(args[3], 16);
    const y = parseInt(args[4], 16);
    const z = parseInt(args[5], 16);
    const L = Math.round(Math.sqrt(x * x + y * y + z * z));
    const temperature = parseInt(args[6], 16);
    return { channel, samples, time, x, y, z, L, temperature };
};

const parseData = (payload) => {
    const dataFormat = payload[1];
    if (dataFormat === 'A' || dataFormat === 'B') {
        if (payload[2] === '0') { // test cancelled
            return { cartridgeId: payload[0], numberOfPoints: 0, points: [] };
        } else {
            const points = payload[2].split(ATTR_DELIM).map(reading => parseReadingABFormat(reading));
            return {
                dataFormat,
                cartridgeId: payload[0],
                numberOfPoints: points.length,
                points
            };
        }
    } else if (dataFormat === 'C') {
        if (payload[2] === '0') { // test cancelled
            return { cartridgeId: payload[0], numberOfPoints: 0, points: [] };
        } else {
            const points = payload[2].split(ATTR_DELIM).map(reading => parseReadingCFormat(reading));
            return {
                dataFormat,
                cartridgeId: payload[0],
                numberOfPoints: points.length,
                points
            };
        }
    } else {
        return { cartridgeId: payload[0], numberOfPoints: 0, points: [] };
    }
};

////////////////////////////////////////////////////////////////////////////////////////
//                                                                                    //
//                                                                                    //
//                          START CALCULATION SECTION                                 //
//                                                                                    //
//                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////

const sqrt3 = Math.sqrt(3);

const hypotenuse = (v) => {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
};

const absorption = (v) => {
    return Math.round((1000 * hypotenuse(v)) / sqrt3);
};

const avgPoints = (points) => {
    const sum = points.reduce(
        (total, point) => {
            return {
                x: total.x + point.x,
                y: total.y + point.y,
                z: total.z + point.z
            };
        },
        { x: 0, y: 0, z: 0 }
    );
    return { x: sum.x / points.length, y: sum.y / points.length, z: sum.z / points.length };
};

const avgPointsIndexed = (points, indexes) => {
    const count = indexes.length;
    const sum = indexes.reduce(
        (total, index) => {
            return {
                x: total.x + points[index].x,
                y: total.y + points[index].y,
                z: total.z + points[index].z
            };
        },
        { x: 0, y: 0, z: 0 }
    );
    return { x: sum.x / count, y: sum.y / count, z: sum.z / count };
};

const validateRawData = (cartridge) => {
    const validation = [];
    const points = cartridge.rawData.points || cartridge.rawData.readings;
    if (!points) {
        validation.push('No optical data');
    } 
    if (!cartridge.assay.analysis) {
        validation.push('Missing analysis section of assay definition');
    }
    if (cartridge.assay && cartridge.assay.analysis && (cartridge.assay.analysis.expectedNumberOfPoints !== points.length)) {
        validation.push(`Wrong number of optical data points: ${cartridge.assay.analysis.expectedNumberOfPoints} expected, ${points.length} found`);
    }                
    points.forEach((point, index) => {
        if (point.L < process.env.OPTICS_L_MIN) {
            validation.push(`data point ${index} too low (${point.L.toFixed(1)} < ${process.env.OPTICS_L_MIN})`);
        } else if (point.L > process.env.OPTICS_L_MAX) {
            validation.push(`data point ${index} too high (${point.L.toFixed(1)} > ${process.env.OPTICS_L_MAX})`);
        }
    });
    return validation;
};

const validateReadouts = ({ readouts, assay }) => {
    const validation = [];
    const analysis = assay.analysis;
    if (readouts.sample === null) {
        validation.push(`sample is null`);
    }
    if (readouts.control0 === null) {
        validation.push(`control0 is null`);
    } else if (analysis.controlLow) {
        if (analysis.controlLow.max && readouts.control0 > analysis.controlLow.max) {
            validation.push(`control0 too high (${readouts.control0.toFixed(1)} > ${analysis.controlLow.max.toFixed(1)})`);
        }
        if (analysis.controlLow.min && readouts.control0 < analysis.controlLow.min) {
            validation.push(`control0 too low (${readouts.control0.toFixed(1)} < ${analysis.controlLow.min.toFixed(1)}`);
        }
    }
    if (readouts.controlHigh === null) {
        validation.push(`controlHigh is null`);
    } else if (analysis.controlHigh) {
        if (analysis.controlHigh.max && readouts.controlHigh > analysis.controlHigh.max) {
            validation.push(`controlHigh too high (${readouts.controlHigh.toFixed(1)} > ${analysis.controlHigh.max.toFixed(1)})`);
        }
        if (analysis.controlHigh.min && readouts.controlHigh < analysis.controlHigh.min) {
            validation.push(`controlHigh too low (${readouts.controlHigh.toFixed(1)} < ${analysis.controlHigh.min.toFixed(1)})`);
        }
    }
    
    if (analysis.controlDelta && readouts.control0 !== null && readouts.controlHigh !== null) {
        const controlDelta = readouts.controlHigh - readouts.control0;
        if (analysis.controlDelta.max && controlDelta > analysis.controlDelta.max) {
            validation.push(`(controlHigh - control0) too high (${controlDelta.toFixed(1)} > ${analysis.controlDelta.max.toFixed(1)})`);
        }
        if (analysis.controlDelta.min && controlDelta < analysis.controlDelta.min) {
            validation.push(`(controlHigh - control0) too low (${controlDelta.toFixed(1)} < ${analysis.controlDelta.min.toFixed(1)})`);
        }
    }

    if (readouts.concentration === null) {
        validation.push(`concentration is null`);
    } else if (analysis.concentration) {
        if (analysis.concentration.max && readouts.concentration > analysis.concentration.max) {
            validation.push(`concentration too high (${readouts.concentration.toFixed(1)} > ${analysis.concentration.max.toFixed(1)})`);
        }
        if (analysis.concentration.min && readouts.concentration < analysis.concentration.min) {
            validation.push(`concentration too low (${readouts.concentration.toFixed(1)} < ${analysis.concentration.min.toFixed(1)})`);
        }
    }
    
    return validation;
};

const calculateAbsorption = (baseline, final) => {
    const ratio = {
        x: final.x ? baseline.x / final.x : 0,
        y: final.y ? baseline.y / final.y : 0,
        z: final.z ? baseline.z / final.z : 0
    };
    return absorption(ratio);
};

const getLinearInterpolationReadouts = (cartridge) => {
    const points = cartridge.rawData.points || cartridge.rawData.readings;
    const sample = calculateAbsorption(avgPointsIndexed(points, [0, 3]), avgPointsIndexed(points, [6, 9, 12]));
    const control0 = calculateAbsorption(avgPointsIndexed(points, [1, 4]), avgPointsIndexed(points, [7, 10, 13]));
    const controlHigh = calculateAbsorption(avgPointsIndexed(points, [2, 5]), avgPointsIndexed(points, [8, 11, 14]));
    const concentration = fixedRound(cartridge.assay.analysis.controlHighConcentration * (sample - control0) / (controlHigh - control0), 1);
    return { sample, control0, controlHigh, concentration };
};

const accumSlope = (result, point, mean) => {
    return {
        num: result.num + (point.x - mean.x) * (point.y - mean.y),
        denom: result.denom + (point.x - mean.x) * (point.x - mean.x)        
    };
};

const fixedRound = (num, digits) => {
    return Number.parseFloat(num.toFixed(digits));
};

const calculateSlope = (points) => {
    const pt = [];
    const mean = { x: 0, y: 0 };
    points.forEach((point) => {
        const p = { x: point.time / 1000, y: point.L };
        mean.x += p.x;
        mean.y += p.y;
        pt.push(p);
    });
    mean.x /= points.length;
    mean.y /= points.length;
    const div = pt.reduce((result, point) => accumSlope(result, point, mean), { num: 0, denom: 0 });
    const slope = -div.num / div.denom;
    return fixedRound(slope, 3);
};

const getLeastSquaresSlopeReadouts = (cartridge) => {
    const points = cartridge.rawData.points || cartridge.rawData.readings;
    const sample = calculateSlope(points.filter((_, index) => index > 2 && (index % 3) === 0));
    const control0 = calculateSlope(points.filter((_, index) => index > 2 && (index % 3) === 1));
    const controlHigh = calculateSlope(points.filter((_, index) => index > 2 && (index % 3) === 2));
    const concentration = fixedRound(cartridge.assay.analysis.controlHighConcentration * (sample - control0) / (controlHigh - control0), 1);
    return { sample, control0, controlHigh, concentration };
};

const calculateLine = (points) => {
    const mean = points.reduce((avg, point) => {
        return {
            x: avg.x + point.x,
            y: avg.y + point.y
        };
    }, { x: 0, y: 0 });
    mean.x /= points.length;
    mean.y /= points.length;
    const div = points.reduce((result, point) => accumSlope(result, point, mean), { num: 0, denom: 0 });
    const slope = fixedRound(div.num / div.denom, 3);
    const yIntercept = mean.y - slope * mean.x;
    const xIntercept = -yIntercept / slope;
    console.log('calculateLine slope xIntercept yIntercept', slope, xIntercept, yIntercept);
    return { slope, xIntercept, yIntercept };
};

const getAreaParams = (cartridge) => {
    const bcode = cartridge.assay.BCODE.code;
    const points = cartridge.rawData.points || cartridge.rawData.readings;
    const baselineCmd = bcode.find((code) => code.command.toUpperCase() === 'SET BASELINE AND READ SENSORS');
    const baselineCount = baselineCmd.params.number_of_readings;
    const baselineTimeCmd = bcode.find((code) => code.command.toUpperCase() === 'SET BASELINE TIME');
    if (baselineTimeCmd) {
        return { measured: true, baselineCount, baselineTime: points[0].time };
    } else {
        const startIndex = bcode.findIndex((code) => code.params.comment === 'Oscillate beads in well 5');
        const endIndex = bcode.findIndex((code) => code.params.command === 'Read Sensors Multiple Times With Pause');
        if (startIndex === -1) {
            console.log('Cannot find well 5 BCODE');
            return { measured: false };
        }
        const bcodeSection = bcode.slice(startIndex - 1, endIndex - 1);
        const msToFirstReading = bcodeSection.reduce((msec, code) => {
            const cmd = code.command.toUpperCase();
            if (cmd === 'DELAY') {
                return msec + code.params.delay_ms;
            } else if (cmd === 'OSCILLATE STAGE') {
                return msec + (code.params.cycles * Math.abs(code.params.microns) * code.params.step_delay_us / 6250);
            } else if (cmd === 'MOVE MICRONS') {
                return msec + (Math.abs(code.params.microns) * code.params.step_delay_us / 12500);
            } else {
                return msec;
            }
        }, 0);
        const baselineTime = points[3 * baselineCount].time - msToFirstReading;
        return { measured: true, baselineCount, baselineTime };
    }
};

const calculateAreaUnderCurve = (points, { baselineCount, baselineTime }) => {
    const avg = avgPoints(points.slice(0, baselineCount));
    const baselineL = hypotenuse(avg);
    const dataPoints = points.slice(baselineCount).map((point) => {
        return {
            x: (point.time - baselineTime) / 1000,
            y: baselineL - hypotenuse(point)
        };
    });
    const line = calculateLine(dataPoints);
    const finalPoint = dataPoints[dataPoints.length - 1];
    console.log('AOC line finalPoint', line, finalPoint);
    if (line.yIntercept > 0) {
        return fixedRound(0.5 * (line.yIntercept + finalPoint.y) * finalPoint.x / 1000, 1);
    } else {
        return fixedRound(0.5 * finalPoint.y * finalPoint.x / 1000, 1);
    }
};

const getAreaUnderCurveReadouts = (cartridge) => {
    const points = cartridge.rawData.points || cartridge.rawData.readings;
    const areaParams = getAreaParams(cartridge);
    if (areaParams.measured) {
        const sample = calculateAreaUnderCurve(points.filter((_, i) => (i % 3 == 0)), areaParams);
        const control0 = calculateAreaUnderCurve(points.filter((_, i) => (i % 3 == 1)), areaParams);
        const controlHigh = calculateAreaUnderCurve(points.filter((_, i) => (i % 3 == 2)), areaParams);
        const concentration = fixedRound(cartridge.assay.analysis.controlHighConcentration * (sample - control0) / (controlHigh - control0), 1);
        return { sample, control0, controlHigh, concentration };
    } else {
        return { sample: null, control0: null, controlHigh: null, concentration: null };
    }
};

const calculateReadouts = (cartridge) => {
    const method = cartridge.assay && cartridge.assay.analysis && cartridge.assay.analysis.methodology;
    if (cartridge.validationErrors.length > 0) {
        return { sample: null, control0: null, controlHigh: null, concentration: null };
    } else if (method) {
        if (method === 'linear interpolation') {
            return getLinearInterpolationReadouts(cartridge);
        } else if (method === 'least squares slope') {
            return getLeastSquaresSlopeReadouts(cartridge);
        } else if (method === 'area under curve') {
            return getAreaUnderCurveReadouts(cartridge);
        } else {
            return { sample: null, control0: null, controlHigh: null, concentration: null };
        }
    }
};

const calculateResult = (cartridge) => {
    const concentration = cartridge.readouts && cartridge.readouts.concentration;
    const cutScores = cartridge.assay && cartridge.assay.analysis && cartridge.assay.analysis.cutScores;
    if (cartridge.validationErrors.length > 0) {
        return 'Invalid';
    } else if (!cutScores) {
        return 'Unknown';
    } else if (typeof concentration !== 'number') {
        return 'Error';
    } else if (concentration > cutScores.redMax || concentration < cutScores.redMin) {
        return 'Positive';
    } else if (concentration > cutScores.greenMax || concentration < cutScores.greenMin) {
        return 'Borderline';
    } else {
        return 'Negative';
    }
};

////////////////////////////////////////////////////////////////////////////////////////
//                                                                                    //
//                                                                                    //
//                           END CALCULATION SECTION                                  //
//                                                                                    //
//                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////

const test_upload = (callback, deviceId, payload) => {
    const result = parseData(payload);
    if (!result.cartridgeId) {
        throw new Error(`FAILURE: Cartridge ID uploaded in device ${deviceId} is missing.`);
    }

    getCartridgeWithSerialNumber(result.cartridgeId)
        .then ((cartridge) => {
            const when = new Date().toISOString().slice(0, 19);
            const who = 'brevitest-cloud';
            const where = cartridge.checkpoints.underway.location;
            cartridge.statusUpdatedOn = when;
            if (result.numberOfReadings) {
                cartridge.status = 'completed';
                cartridge.checkpoints.completed = { when, who, where };
                cartridge.rawData = result;
                cartridge.validationErrors = validateRawData(cartridge);
                if (cartridge.validationErrors.length == 0) {
                    cartridge.readouts = calculateReadouts(cartridge);
                    cartridge.validationErrors = validateReadouts(cartridge);
                    cartridge.result = calculateResult(cartridge);
                } else {
                    cartridge.readouts = { sample: null, control0: null, controlHigh: null, concentration: null };
                    cartridge.result = null;
                }
            } else {
                cartridge.status = 'cancelled';
                cartridge.checkpoints.cancelled = { when, who, where };
                cartridge.rawData = null;
                cartridge.validationErrors = [];
                cartridge.readouts = { sample: null, control0: null, controlHigh: null, concentration: null };
                cartridge.result = null;
            }
            return saveDocument(cartridge);
        })
        .then((updatedCartridge) => {
            if (updatedCartridge.validationErrors.length > 0) {
                send_response(callback, deviceId, 'upload-test', 'INVALID', result.cartridgeId);
            } else {
                send_response(callback, deviceId, 'upload-test', 'SUCCESS', result.cartridgeId);
            }
        })
        .catch((error) => {
            if (error.message) {
                send_response(callback, deviceId, 'upload-test', 'FAILURE', error.message);
            } else {
                error.cartridgeId = result.cartridgeId;
                send_response(callback, deviceId, 'upload-test', 'ERROR', error);
            }
        });
};

const within_bounds = (readings, max, min) => {
    return readings.reduce((ok, reading) => {
        return ok && (reading.L <= max && reading.L >= min); 
    }, true);
};

const device_validated = (validation) => {
    let validated = true;
    if (validation.magnetometer) {
        validation.magnetometer.valid = validation.magnetometer.data.reduce((ok, well) => {
            return ok && (Math.abs(well.gauss_z) > process.env.MAGNET_MINIMUM_Z_GAUSS); 
        }, true);
        validated = validated && validation.magnetometer.valid;
    }
    if (validation.color0000 && Object.keys(validation.color0000).length) {
        validation.color0000.valid = within_bounds(validation.color0000.data, process.env.OPTICS_0000_MAX, process.env.OPTICS_0000_MIN);
        validated = validated && validation.color0000.valid;
    }
    if (validation.color0202 && Object.keys(validation.color0202).length) {
        validation.color0202.valid = within_bounds(validation.color0202.data, process.env.OPTICS_0202_MAX, process.env.OPTICS_0202_MIN);
        validated = validated && validation.color0202.valid;
    }
    if (validation.color0218 && Object.keys(validation.color0218).length) {
        validation.color0218.valid = within_bounds(validation.color0218.data, process.env.OPTICS_0218_MAX, process.env.OPTICS_0218_MIN);
        validated = validated && validation.color0218.valid;
    }
    return validated;
};

const update_validation = (callback, eventName, deviceId, magnetometer, color) => {
    let validated = false;
    const validationDate = new Date();
    getDocument(deviceId)
        .then ((response) => {
            const validation = response.data.validation || {
                    magnetometer: {},
                    color0000: {},
                    color0202: {},
                    color0218: {}
                };
            
            if (magnetometer) {
                validation.magnetometer = { ...magnetometer, validationDate };
            } else if (color.n0000) {
                validation.color0000 = { ...color.n0000, validationDate };
            } else if (color.n0202) {
                validation.color0202 = { ...color.n0202, validationDate };
            } else if (color.n0218) {
                validation.color0218 = { ...color.n0218, validationDate };
            }
            validated = device_validated(validation);
            const device = {
                ...response.data,
                validated,
                validation
            };
            if (validated) {
                device.lastValidatedOn = validationDate;
            }
            return saveDocument(device);
        })
        .then(() => {
            send_response(callback, deviceId, eventName, 'SUCCESS', validated ? 'validated' : 'not validated');
        })
        .catch((error) => {
            if (error.message) {
                send_response(callback, deviceId, eventName, 'FAILURE', error.message);
            } else {
                send_response(callback, deviceId, eventName, 'ERROR', deviceId);
            }
        });
};

const validate_magnets = (callback, deviceId, payload) => {
    const rows = payload.split('\n').slice(0, -1);
    const data = [];
    rows.slice(1).forEach((row) => {
        const well = row.split('\t');
        data.push({
            well: well[0],
            channel: "sample",
            temperature: parseFloat(well[1]),
            gauss_x: parseFloat(well[2]),
            gauss_y: parseFloat(well[3]),
            gauss_z: parseFloat(well[4])
        });
        data.push({
            well: well[0],
            channel: "control_low",
            temperature: parseFloat(well[5]),
            gauss_x: parseFloat(well[6]),
            gauss_y: parseFloat(well[7]),
            gauss_z: parseFloat(well[8])
        });
        data.push({
            well: well[0],
            channel: "control_high",
            temperature: parseFloat(well[9]),
            gauss_x: parseFloat(well[10]),
            gauss_y: parseFloat(well[11]),
            gauss_z: parseFloat(well[12])
        });
    });

    const magnetometer = {
        instrument: rows[0],
        data
    };

    update_validation(callback, 'validate-magnets', deviceId, magnetometer, null);
};

const validate_optics = (callback, deviceId, payload) => {
    const data = parseData(payload);
    if (!data.cartridgeId) {
        send_response(callback, deviceId, 'validate-optics', 'FAILURE', 'Missing optical instrument code');
    }
    const codes = data.cartridgeId.split('-');
    if (codes[0] !== 'OPT') {
        send_response(callback, deviceId, 'validate-optics', 'FAILURE', 'Incorrect barcode for optical test');
    }
    const color = {};
    color['n' + codes[2]] = {
        instrument: data.cartridgeId,
        data: [ ...data.readings ]

    };
    update_validation(callback, 'validate-optics', deviceId, null, color);
};

const write_log = (deviceId, event_type, status, data) => {
	const loggedOn = new Date();
	const _id = 'log_' + loggedOn.toISOString();
    const log_entry = {
        _id,
        schema: 'log',
		loggedOn,
		deviceId,
		type: event_type,
		status,
        data
    };

	saveDocument(log_entry)
        .then((response) => {
            if (!response || response.status > 202) {
                throw new Error(`Log entry not saved`);
            }
        })
        .catch((error) => {
            console.error('Log entry save error', error);
        });
};

const send_response = (callback, deviceId, event_type, status, data) => {
    const response = {
		statusCode: 200,
    	"isBase64Encoded": false
    };

	write_log(deviceId, event_type, status, data);
    const responseData = typeof(data) === 'object' ? JSON.stringify(data) : data;
    response.body = `${event_type}${ITEM_DELIM}${status}${ITEM_DELIM}${responseData}${END_DELIM}`;

	callback(null, response);
};

const parseEvent = (event) => {
    const payload = event.queryStringParameters.data.split(ITEM_DELIM);
    return {
        event_name: event.queryStringParameters.event,
        event_type: payload[0],
        deviceId: event.queryStringParameters.coreid,
        data: payload.length === 2 ? payload[1] : payload.slice(1)
    };
};

exports.handler = (event, context, callback) => {
	if (event) {
		if (event.queryStringParameters) {
            const body = parseEvent(event);
            if (body.event_name !== 'brevitest-production') {
                send_response(callback, body.deviceId || 'unknown', 'unknown', 'ERROR', 'Brevitest unknown event');
            } else {
                switch (body.event_type) {
                    case 'verify-device':
                        verify_device(callback, body.deviceId, body.data);
                        break;
                    case 'validate-cartridge':
                        validate_cartridge(callback, body.deviceId, body.data);
                        break;
                    case 'start-test':
                        test_start(callback, body.deviceId, body.data);
                        break;
                    case 'upload-test':
                        test_upload(callback, body.deviceId, body.data);
                        break;
                    case 'validate-magnets':
                        validate_magnets(callback, body.deviceId, body.data);
                        break;
                    case 'validate-optics':
                        validate_optics(callback, body.deviceId, body.data);
                        break;
                    case 'test-event':
                        send_response(callback,  body.deviceId, body.event_type, 'SUCCESS', 'Test event received');
                        break;
                    default:
                        send_response(callback,  body.deviceId, body.event_type, 'FAILURE', `Event type ${body.event_type} not found`);
                }
            }
		} else {
			send_response(callback, 'unknown', 'unknown', 'ERROR', 'Brevitest event malformed');
		}
	} else {
		send_response(callback, 'unknown', 'unknown', 'ERROR', 'Brevitest request malformed');
	}
};
