const db = require('nano')('http://brevitestdatabase.com:5984/development');
const Particle = require('particle-api-js');

const particle = new Particle();

const ARG_DELIM = ',';
const ATTR_DELIM = ':';
const ITEM_DELIM = '|';
const END_DELIM = "#";
// const DELIMS = [ ARG_DELIM, ATTR_DELIM, ITEM_DELIM, END_DELIM ]

const login = () => {
	return particle.login({
		username: 'particle@brevitest.com',
		password: 'FbM-c9p-SGJ-LN8'
	});
}

const getVariable = (deviceId, token) => {
	return particle.getVariable({
		deviceId: deviceId,
		name: 'register',
		auth: token
	});
}

const saveDocument = (doc) => {
	return db.insert(doc);
}

const getDocument = (docId) => {
    return db.get(docId);
}

const fetchDocuments = (keys) => {
    return db.fetch({ keys });
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
    getDocument(deviceId)
        .then ((device) => {
            device.lastActiveOn = new Date();
            return saveDocument(device);
        })
        .then((response) => {
            if (!response || !response.ok) {
               throw new Error(`Device ${deviceId} not registered`);
            }
            send_response(callback, deviceId, 'register-device', 'SUCCESS', deviceId);
        })
        .catch((error) => {
            if (error.message) {
                send_response(callback, deviceId, 'register-device', 'FAILURE', error.message);
            } else {
                send_response(callback, deviceId, 'register-device', 'ERROR', deviceId);
            }
        });
}

const validate_cartridge = (callback, deviceId, cartridgeId) => {
	if (!cartridgeId) {
        send_response(callback, deviceId, 'validate-cartridge', 'FAILURE', `Cartridge ID missing`);
    } else if (!deviceId) {
        send_response(callback, deviceId, 'validate-cartridge', 'FAILURE', `Device ID missing`);
    } else {
        let code = null;
        const assayId = cartridgeId.slice(0, 8);
        fetchDocuments([deviceId, assayId, cartridgeId])
            .then((response) => {
                if (!(response && response.rows && (response.rows.length === 3))) {
                    throw new Error(`Could not find device ${deviceId}, assay ${assayId}, or cartridge ${cartridgeId}`);
                }

                const device = response.rows[0].doc;
                const assay = response.rows[1].doc;
                const cartridge = response.rows[2].doc;

                if (cartridge.used) {
                    throw new Error(`Cartridge ${cartridgeId} already used`);
                } else if (cartridge.status !== 'linked') {
                    throw new Error(`Cartridge ${cartridgeId} is not linked to a sample`);
                } else if (!cartridge.linkReference) {
                    throw new Error(`Cartridge ${cartridgeId} is missing a reference for its sample`);
                } else if (!cartridge.customerId) {
                    throw new Error(`Cartridge ${cartridgeId} is not assigned to a customer`);
                } else if (cartridge.customerId !== device.customerId) {
                    throw new Error(`Cartridge customer ${cartridge.customerId} does not match device customer ${device.customerId}`);
                }

                code = assay.BCODE.code
                cartridge.device = device;
                cartridge.assay = assay;
                cartridge.status = 'underway';
                cartridge.used = true;
                cartridge.testStartedOn = new Date();
                return saveDocument(cartridge);
            })
            .then((response) => {
                if (!(response && response.ok)) {
                    throw new Error(`Cartridge ${cartridgeId} could not be saved in the database`);
                }
                const responseString = generateResponseString(cartridgeId, code);
                send_response(callback, deviceId, 'validate-cartridge', 'SUCCESS', responseString);
            })
            .catch((error) => {
                if (error.message) {
                    send_response(callback, deviceId, 'validate-cartridge', 'FAILURE', error.message);
                } else {
                    error.cartridgeId = cartridgeId;
                    send_response(callback, deviceId, 'validate-cartridge', 'ERROR', error);
                }
            });
    }
}

const test_status_update = (callback, deviceId, cartridgeId, event_type, new_status) => {
	if (!deviceId) {
        send_response(callback, deviceId, event_type, `FAILURE', 'Device ID missing`);
    } else if (!cartridgeId) {
        send_response(callback, deviceId, event_type, `FAILURE', 'Cartridge ID missing`);
    } else {
        getDocument(cartridgeId)
		    .then((cartridge) => {
                if (!cartridge) {
                    throw new Error(`Cartridge ${cartridgeId} not found`);
                }
                cartridge.status = new_status;
                if (new_status === 'pending' || new_status === 'cancelled') {
                    cartridge.testFinishedOn = new Date();
                }
                console.log('cartridge', cartridge);
			    return saveDocument(cartridge);
            })
            .then((response) => {
                if (!(response && response.ok)) {
                    throw new Error(`Cartridge ${cartridgeId} could not be saved in the database`);
                }
                send_response(callback, deviceId, event_type, 'SUCCESS', cartridgeId);
            })
            .catch((error) => {
                if (error.message) {
                    send_response(callback, deviceId, event_type, 'FAILURE', error.message.slice(8));
                } else {
                    error.cartridgeId = cartridgeId;
                    send_response(callback, deviceId, event_type, 'ERROR', error);
                }
            })
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

const parseData = (str) => {
    const lines = str.split(ITEM_DELIM);
    if (lines[1] === 'A') {
        const readings = lines[2].split(ATTR_DELIM).map(reading => parseReading(reading));
        return {
            cartridgeId: lines[0],
            numberOfReadings: readings.length,
            readings
        }
    } else {
        return {
            cartridgeId: lines[0],
            numberOfReadings: 0,
            readings: []
        }
    }
}

const square = a => a * a;
// const mean = a.length ? a.reduce((sum, elem) => (sum + elem), 0) / a.length : NaN;

const xyzDiff = (r1, r2) => {
	return Math.sqrt(square(r1.x - r2.x) + square(r1.y - r2.y) + square(r1.z - r2.z));
}

const readoutValue = (channel, readings) => {
    if (channel === 'A') {
        return Math.round(readings[0].L - (readings[9].L + readings[6].L) * 0.5);
    } else if (channel === '1') {
        return Math.round(readings[1].L - (readings[10].L + readings[7].L) * 0.5);
    } else if (channel === '2') {
        return Math.round(readings[2].L - (readings[11].L + readings[8].L) * 0.5);
    } else {
        return 0;
    }
}

const calculateReadouts = (readings) => {
    const sample = readoutValue('A', readings);
    const control1 = readoutValue('1', readings);
    const control2 = readoutValue('2', readings);
	return {
        sample,
        control1,
        control2
    }
};

const test_upload = (callback, deviceId, cartridgeId) => {
    let result = null;

	if (!deviceId) {
		send_response(callback, deviceId, 'test-upload', 'FAILURE', 'No device id');
	} else if (!cartridgeId) {
		send_response(callback, cartridgeId, 'test-upload', 'FAILURE', 'No cartridge id');
	} else {
		login(deviceId)
            .then((response) => {
                const token = response.body.access_token;
                return getVariable(deviceId, token);
            })
            .then((response) => {
                if (!response || !response.body || !response.body.result) {
                    throw new Error(`FAILURE: Unable to get test for cartridge ${cartridgeId} from device ${deviceId}`);
                }
                result = parseData(response.body.result);

                if (result.cartridgeId !== cartridgeId) {
                    throw new Error(`FAILURE: Cartridge ID ${cartridgeId} in device ${deviceId} does not match Cartridge ID uploaded`);
                }

                return getDocument(cartridgeId);
            })
            .then ((cartridge) => {
                if (!cartridge) {
                    throw new Error(`Cartridge ${cartridgeId} not found`);
                }

                cartridge.rawData = result;
                cartridge.readouts = (result && result.readings && result.readings.length === 12) ? calculateReadouts(result.readings) : {};
                
                if (typeof cartridge.readouts.sample !== 'number') {
                    cartridge.result = 'Unknown';
                } else if (cartridge.readouts.sample > cartridge.assay.standardCurve.cutScores.redMax || cartridge.readouts.sample < cartridge.assay.standardCurve.cutScores.redMin) {
                    cartridge.result = 'Positive';
                } else if (cartridge.readouts.sample > cartridge.assay.standardCurve.cutScores.greenMax || cartridge.readouts.sample < cartridge.assay.standardCurve.cutScores.greenMin) {
                    cartridge.result = 'Borderline';
                } else {
                    cartridge.result = 'Negative';
                }
                cartridge.status = 'completed';
                return saveDocument(cartridge);
            })
            .then((response) => {
                if (!response || !response.ok) {
                    throw new Error(`Cartridge ${cartridgeId} not saved`);
                }
                send_response(callback, deviceId, 'test-upload', 'SUCCESS', cartridgeId);
            })
            .catch((error) => {
                if (error.message) {
                    send_response(callback, deviceId, 'test-upload', 'FAILURE', error.message);
                } else {
                    error.cartridgeId = cartridgeId;
                    send_response(callback, deviceId, 'test-upload', 'ERROR', error);
                }
            });
	}
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

	return saveDocument(log_entry);
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
        data: payload[1]
    }
}

exports.handler = (event, context, callback) => {
	if (event) {
		if (event.queryStringParameters) {
            const body = parseEvent(event);
            if (body.event_name !== 'brevitest-development') {
                send_response(callback, body.deviceId || 'unknown', 'unknown', 'ERROR', 'Brevitest unknown event');
            } else {
                switch (body.event_type) {
                    case 'register-device':
                        register_device(callback, body.deviceId);
                        break;
                    case 'validate-cartridge':
                        validate_cartridge(callback, body.deviceId, body.data);
                        break;
                    case 'test-finish':
                        test_status_update(callback, body.deviceId, body.data, body.event_type, 'pending');
                        break;
                    case 'test-cancel':
                        test_status_update(callback, body.deviceId, body.data, body.event_type, 'cancelled');
                        break;
                    case 'test-upload':
                        test_upload(callback, body.deviceId, body.data);
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
