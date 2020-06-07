const axios = require('axios')

axios.defaults.baseURL = 'https://brevitest-couchdb.com:6984';
axios.defaults.headers.common['Authorization'] = `Basic YWRtaW46ZkBubiFuLkRybjA=`;

const ARG_DELIM = ',';
const ATTR_DELIM = ':';
const ITEM_DELIM = '|';
const END_DELIM = "#";
// const DELIMS = [ ARG_DELIM, ATTR_DELIM, ITEM_DELIM, END_DELIM ]

const saveDocument = (doc) => {
    return axios.put(`/production/${doc._id}`, { ...doc });
}

const getDocument = (docId) => {
    return axios.get(`/production/${docId}`, { include_docs: true });
}

const getCartridgeWithBarcode = (barcode) => {
    const params = { include_docs: true, key: `"${barcode}"` };
    console.log('barcode', barcode, 'params', params);
    return axios
        .get(`/production/_design/cartridges/_view/barcode`, { params })
        .then((response) => {
            // console.log('getCartridgeWithBarcode', response)
            if (
                !response ||
                response.status !== 200 ||
                !response.data ||
                !response.data.rows ||
                response.data.rows.length !== 1
            ) {
                throw new Error(`List status = ${response && response.status}`);
            }
            return  response.data.rows[0].doc;
        })
}

const getDeviceAndAssay = (keys) => {
    return axios
        .post(`/production/_all_docs`, { keys },  { params: { include_docs: true } })
        .then((response) => {
            console.log('getDeviceAndAssay', response)
            if (
                !response ||
                response.status !== 200 ||
                !response.data ||
                !response.data.rows ||
                response.data.rows.length !== 2
            ) {
                throw new Error(`Could not find device ${deviceId}, assay ${assayId}, or cartridge ${cartridgeId}`);
            }
            const device = response.data.rows[0].doc;
            const assay = response.data.rows[1].doc;
            return { device, assay }
        })
}

const bcodeCommands = [{
	num: '0',
	name: 'Start Test',
	params: [],
	description: 'Starts the test. Required to be the first command. Test executes until Finish Test command.'
}, {
	num: '1',
	name: 'Delay',
	params: ['delay_ms'],
	description: 'Waits for specified number of milliseconds.'
}, {
	num: '2',
	name: 'Move Microns',
	params: ['microns', 'step_delay_us'],
	description: 'Moves the stage a specified number of microns at a specified speed expressed as a step delay in microseconds.'
}, {
	num: '3',
	name: 'Oscillate Stage',
	params: ['microns', 'step_delay_us', 'cycles'],
	description: 'Oscillates back and forth a given distance at a specified speed expressed as a step delay in microseconds.'
}, {
	num: '4',
	name: 'Buzz',
	params: ['duration_ms', 'frequency'],
	description: 'Turns on the buzzer for a specified number of milliseconds at a specified frequency.'
}, {
	num: '10',
	name: 'Read Sensors',
	params: [],
	description: 'Takes readings from the sensors.'
}, {
	num: '11',
	name: 'Read Sensors With Parameters',
	params: ['param','led_power'],
	description: 'Read sensors with input parameters.'
}, {
	num: '20',
	name: 'Repeat',
	params: ['count'],
	description: 'Repeats the block of BCODE.'
}, {
	num: '98',
    name: 'Comment',
    params: ['text'],
    description: 'Comment - ignored by system.'
  }, {
	num: '99',
	name: 'Finish Test',
	params: [],
	description: 'Finishes the test. Required to be the final command.'
}];

const getBcodeCommand = (cmd) => {
	return bcodeCommands.find(e => e.name === cmd);
}

const instructionTime = (command, params) => {
    // jscs:disable requireCamelCaseOrUpperCaseIdentifiers
	switch (command) {
        case 'Delay': // delay
            return parseInt(params.delay_ms);
        case 'Move Microns': // move microns
            return Math.floor(Math.abs(parseInt(params.microns)) * parseInt(params.step_delay_us) / 25000);
        case 'Oscillate Stage': // oscillate
            return Math.floor(2 * parseInt(params.cycles) * Math.abs(parseInt(params.microns)) * parseInt(params.step_delay_us) / 25000);
        case 'Buzz': // buzz the buzzer
            return parseInt(params.duration_ms);
        case 'Read Sensors': // read Sensors
        case 'Read Sensors With Parameters':
            return 10000;
        case 'Start Test': // starting sensor reading plus LED warmup
            return 6000;
        case 'Finish Test': // starting sensor reading plus LED warmup
            return 6000;
	}
	// jscs:enable requireCamelCaseOrUpperCaseIdentifiers
	return 0;
}

const bcodeDuration = (bcodeArray) => {
    const total_duration = bcodeArray.reduce((duration, bcode) => {
            if (bcode.command === 'Repeat') {
                return duration + bcodeDuration(bcode.code) * parseInt(bcode.count);
            } else {
                return duration + instructionTime(bcode.command, bcode.params);
            }
        }, 0);

    return parseInt(total_duration);
}

const compileInstruction = (cmd, args) => {
    const command = getBcodeCommand(cmd);
    const keys = Object.keys(args);
	const argKeys = keys.length ? keys.filter(k => k !== 'comment') : [];  // remove comments
	if (command.params.length !== argKeys.length) {
		throw new Error(`Parameter count mismatch, command: ${cmd} should have ${command.params.length}, has ${argKeys.length}`);
    }
    if (command.params.length) {
        return command.params.reduce((result, param) => `${result}${ARG_DELIM}${args[param]}`, command.num) + ATTR_DELIM;
    } else {
        return command.num + ATTR_DELIM;
    }
}

const compileRepeatBegin = (count) => {
	return `20,${count}${ATTR_DELIM}`;
}

const compileRepeatEnd = () => {
	return `21${ATTR_DELIM}`;
}

const bcodeCompile = (bcodeArray) => {
    return bcodeArray.reduce((compiledCode, bcode) => {
        if (bcode.command === 'Comment') {
            return compiledCode;
        } else if (bcode.command === 'Repeat') {
            return compiledCode + compileRepeatBegin(bcode.count) + bcodeCompile(bcode.code) + compileRepeatEnd();
        } else {
            return compiledCode + compileInstruction(bcode.command, bcode.params);
        }
    }, '');
}

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
}

const generateResponseString = (cartridgeId, code) => {
    const bcodeVersion = 2
    const compiledBCODE =  bcodeCompile(code);
    const duration = parseInt(bcodeDuration(code) / 1000);
    const result = [
        cartridgeId,
        bcodeVersion,
        checksum(compiledBCODE),
        duration,
        compiledBCODE.length,
        compiledBCODE
    ]

    return result.join(ITEM_DELIM);
}

const register_device = (callback, deviceId) => {
    // console.log('register_device enter', deviceId);
    getDocument(deviceId)
        .then ((response) => {
            if (response.status !== 200 && response.status !== 304) {
               throw new Error(`Device ${deviceId} load error - response = ${response}`);
            }
            const device = response.data;
            device.lastActiveOn = new Date();
            return saveDocument(device);
        })
        .then((response) => {
            if (response.status === 201 || response.status === 202) {
                send_response(callback, deviceId, 'register-device', 'SUCCESS', deviceId);
            } else {
                throw new Error(`Device ${deviceId} not registered`);
            }
        })
        .catch((error) => {
            if (error.message) {
                send_response(callback, deviceId, 'register-device', 'FAILURE', error.message);
            } else {
                send_response(callback, deviceId, 'register-device', 'ERROR', deviceId);
            }
        });
}

const validate_cartridge = (callback, deviceId, barcode) => {
	if (!barcode) {
        send_response(callback, deviceId, 'validate-cartridge', 'FAILURE', `Barcode missing`);
    } else if (!deviceId) {
        send_response(callback, deviceId, 'validate-cartridge', 'FAILURE', `Device ID missing`);
    } else {
        let code = null;
        let cartridge = null;
        // console.log(deviceId, assayId, cartridgeId)
        getCartridgeWithBarcode(barcode)
            .then((c) => {
                cartridge = c;
                console.log('cartridge', cartridge);
                if (!cartridge) {
                    throw new Error(`Cartridge ${cartridge._id} missing, may be deleted`);
                } else if (cartridge.used) {
                    throw new Error(`Cartridge ${cartridge._id} already used`);
                } else if (cartridge.status !== 'linked') {
                    throw new Error(`Cartridge ${cartridge._id} is not linked to a sample`);
                } else if (!cartridge.orderId) {
                    throw new Error(`Cartridge ${cartridge._id} is missing an order number`);
                } else if (!cartridge.customerId) {
                    throw new Error(`Cartridge ${cartridge._id} is not assigned to a customer`);
                }
                const assayId = cartridge._id.slice(0, 8);
                return getDeviceAndAssay([deviceId, assayId]);
            })
            .then(({ device, assay}) => {
                if (cartridge.customerId !== device.customerId) {
                    throw new Error(`Cartridge customer ${cartridge.customerId} does not match device customer ${device.customerId}`);
                }
                code = assay.BCODE.code;
                cartridge.device = device;
                cartridge.assay = assay;
                cartridge.status = 'underway';
                cartridge.used = true;
                cartridge.testStartedOn = new Date();
                return saveDocument(cartridge);
            })
            .then((response) => {
                if (response.status === 201 || response.status === 202) {
                    const responseString = generateResponseString(cartridge._id, code);
                    send_response(callback, deviceId, 'validate-cartridge', 'SUCCESS', responseString);
                } else {
                    throw new Error(`Cartridge ${cartridge._id} could not be saved in the database`);
                }
            })
            .catch((error) => {
                if (error.message) {
                    send_response(callback, deviceId, 'validate-cartridge', 'FAILURE', error.message);
                } else {
                    send_response(callback, deviceId, 'validate-cartridge', 'ERROR', deviceId);
                }
            });
    }
}

const parseReading = (reading) => {
	const args = reading.split(ARG_DELIM);
    const x = parseInt(args[1], 16);
    const y = parseInt(args[2], 16);
    const z = parseInt(args[3], 16);
    const L = Math.round(Math.sqrt(x * x + y * y + z * z));
return {
		channel: args[0],
		x,
		y,
        z,
        L,
		temperature: parseInt(args[4], 16)
	};
}

const parseData = (payload) => {
    if (payload[1] === 'A' || payload[1] === 'B') {
        if (payload[2] === '0') { // test cancelled
            return { cartridgeId: payload[0], numberOfReadings: 0, readings: [] }
        } else {
            const readings = payload[2].split(ATTR_DELIM).map(reading => parseReading(reading));
            return {
                cartridgeId: payload[0],
                numberOfReadings: readings.length,
                readings
            }
        }
    } else {
        return { cartridgeId: payload[0], numberOfReadings: 0, readings: [] }
    }
}

const sqrt3 = Math.sqrt(3)

const magnitude = (v) => {
    return Math.round((1000 * Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)) / sqrt3)
}

const readoutValue = (baseline, final) => {
    const ratio = {
        x: final.x ? baseline.x / final.x : 0,
        y: final.y ? baseline.y / final.y : 0,
        z: final.z ? baseline.z / final.z : 0
    }
    return magnitude(ratio)
}

const avgReadings = (readings, indexes) => {
    const count = indexes.length
    const sum = indexes.reduce(
        (total, index) => {
            return {
                x: total.x + readings[index].x,
                y: total.y + readings[index].y,
                z: total.z + readings[index].z
            }
        },
        { x: 0, y: 0, z: 0 }
    )
    return { x: sum.x / count, y: sum.y / count, z: sum.z / count }
}

const calculateReadouts = (readings) => {
    const sample = readoutValue(avgReadings(readings, [0, 3]), avgReadings(readings, [6, 9, 12]))
    const control1 = readoutValue(avgReadings(readings, [1, 4]), avgReadings(readings, [7, 10, 13]))
    const control2 = readoutValue(avgReadings(readings, [2, 5]), avgReadings(readings, [8, 11, 14]))
    const control0 = control1 > control2 ? control2 : control1
    const control20 = control1 > control2 ? control1 : control2
    const concentration =
        control20 - control0 >= 10
            ? Number.parseFloat(((20 * (sample - control0)) / (control20 - control0)).toFixed(1))
            : null
    return { sample, control0, control20, concentration }
}

const calculateResult = (concentration, cutScores) => {
    if (!cutScores) {
        return 'Unknown'
    } else if (concentration === null) {
        return 'Failure'
    } else if (typeof concentration !== 'number') {
        return 'Error'
    } else if (concentration > cutScores.redMax || concentration < cutScores.redMin) {
        return 'Positive'
    } else if (concentration > cutScores.greenMax || concentration < cutScores.greenMin) {
        return 'Borderline'
    } else {
        return 'Negative'
    }
}

const test_upload = (callback, deviceId, payload) => {
    const result = parseData(payload);

    if (!result.cartridgeId) {
        throw new Error(`FAILURE: Cartridge ID uploaded in device ${deviceId} is missing.`);
    }

    getDocument(result.cartridgeId)
        .then ((response) => {
            if (!response || !(response.status === 200 || response.status === 304)) {
                throw new Error(`Cartridge ${result.cartridgeId} not found`);
            }

            const cartridge = response.data;
            cartridge.testFinishedOn = new Date();
            if (result.numberOfReadings === 0) {
                cartridge.status = 'cancelled';
            } else {
                cartridge.status = 'completed'
                cartridge.rawData = result;
                if (result && result.readings && result.readings.length === 15) {
                    cartridge.readouts = calculateReadouts(result.readings);
                    if (cartridge.assay && cartridge.assay.standardCurve) {
                        cartridge.result = calculateResult(cartridge.readouts.concentration, cartridge.assay.standardCurve.cutScores);
                    } else {
                        cartridge.result = null;
                    }
                } else {
                    cartridge.readouts = {};
                    cartridge.result = null;
                }
            }
            return saveDocument(cartridge);
        })
        .then((response) => {
            if (!response || response.status > 202) {
                throw new Error(`Cartridge ${result.cartridgeId} not saved`);
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
}

const write_log = (deviceId, event_type, status, data) => {
	// console.log('write_log', deviceId, event_type, status, data);
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
            console.error('Log entry save error', error)
        });
}

const send_response = (callback, deviceId, event_type, status, data) => {
    const response = {
		statusCode: 200,
    	"isBase64Encoded": false
    };

	write_log(deviceId, event_type, status, data);
    const responseData = typeof(data) === 'object' ? JSON.stringify(data) : data;
    response.body = `${event_type}${ITEM_DELIM}${status}${ITEM_DELIM}${responseData}${END_DELIM}`

	callback(null, response);
}

const parseEvent = (event) => {
    const payload = event.queryStringParameters.data.split(ITEM_DELIM);
    return {
        event_name: event.queryStringParameters.event,
        event_type: payload[0],
        deviceId: event.queryStringParameters.coreid,
        data: payload.length === 2 ? payload[1] : payload.slice(1)
    }
}

exports.handler = (event, context, callback) => {
    // console.log('starting', event);
	if (event) {
		if (event.queryStringParameters) {
            const body = parseEvent(event);
            if (body.event_name !== 'brevitest-production') {
                send_response(callback, body.deviceId || 'unknown', 'unknown', 'ERROR', 'Brevitest unknown event');
            } else {
                switch (body.event_type) {
                    case 'register-device':
                        register_device(callback, body.deviceId);
                        break;
                    case 'validate-cartridge':
                        validate_cartridge(callback, body.deviceId, body.data);
                        break;
                    case 'upload-test':
                        test_upload(callback, body.deviceId, body.data);
                        break;
                    case 'test-event':
                        send_response(callback, body.event_type, 'SUCCESS', 'Test event received', body.event_type);
                        break;
                    default:
                        send_response(callback, body.event_type, 'FAILURE', `Event not found:${body.event_type}`);
                }
            }
		} else {
			send_response(callback, 'unknown', 'unknown', 'ERROR', 'Brevitest event malformed');
		}
	} else {
		send_response(callback, 'unknown', 'unknown', 'ERROR', 'Brevitest request malformed');
	}
}
