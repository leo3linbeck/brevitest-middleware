var rp = require('request-promise');

var bcodeCommands = [{
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
	name: 'Move',
	params: ['steps', 'step_delay_us'],
	description: 'Moves the stage a specified number of steps at a specified speed expressed as a step delay in microseconds.'
}, {
	num: '3',
	name: 'Solenoid On',
	params: ['energize_ms'],
	description: 'Energizes the solenoid for a specified number of milliseconds.'
}, {
	num: '4',
	name: 'Device LED On White',
	params: [],
	description: 'Turns on the device LED, which is visible outside the device, full power white.'
}, {
	num: '5',
	name: 'Device LED Off',
	params: [],
	description: 'Turns off the device LED.'
}, {
	num: '6',
	name: 'Device LED On With Color',
	params: ['red', 'green', 'blue'],
	description: 'Turns on the device LED, which is visible outside the device, with the specified RGB values.'
}, {
	num: '7',
	name: 'Sensor LED On',
	params: ['power'],
	description: 'Turns on the sensor LED at a given power.'
}, {
	num: '8',
	name: 'Sensor LED Off',
	params: [],
	description: 'Turns off the sensor LED.'
}, {
	num: '9',
	name: 'Read Sensors',
	params: [],
	description: 'Takes readings from the sensors.'
}, {
	num: '10',
	name: 'Read QR Code',
	params: [],
	description: 'Reads the cartridge QR code.'
}, {
	num: '11',
	name: 'Disable Sensor',
	params: [],
	description: 'Disables the sensors, switching them to low-power mode.'
}, {
	num: '90',
	name: 'Repeat',
	params: ['count'],
	description: 'Repeat a block of commands a specified number of times. Nesting is acceptable.'
}, {
	num: '99',
	name: 'Finish Test',
	params: [],
	description: 'Finishes the test. Required to be the final command.'
}];

var deviceParams;

var integrationDelay = {
	0xFF: 2.4,
	/**<  2.4ms - 1 cycle    - Max Count: 1024  */
	0xF6: 24,
	/**<  24ms  - 10 cycles  - Max Count: 10240 */
	0xEB: 50,
	/**<  50ms  - 20 cycles  - Max Count: 20480 */
	0xD5: 101,
	/**<  101ms - 42 cycles  - Max Count: 43008 */
	0xC0: 154,
	/**<  154ms - 64 cycles  - Max Count: 65535 */
	0x00: 700 /**<  700ms - 256 cycles - Max Count: 65535 */
};

function getBcodeCommand(cmd) {
	return bcodeCommands.find(function (e) {
		return e.name === cmd;
	});
}

function instructionTime(command, params) {
	var d = 0;
	// jscs:disable requireCamelCaseOrUpperCaseIdentifiers
	switch (command) {
	case 'Delay': // delay
		d = parseInt(params.delay_ms);
		break;
	case 'Solenoid On': // solenoid on
		d = parseInt(params.energize_ms);
		break;
	case 'Move': // move
		d = Math.floor(Math.abs(parseInt(params.steps)) * parseInt(params.step_delay_us) / 1000);
		break;
	case 'Blink Device LED': // blink device LED
		d = 2 * Math.floor(parseInt(params.blinks) * parseInt(params.period_ms));
		break;
	case 'Read Sensors': // read sensor
		d = integrationDelay[deviceParams.integrationTime];
		if (typeof d === 'undefined') {
			throw new Error('Unknown integration time code');
		}
		d = deviceParams.delayBetweenSensorReadings + d * 10;
		break;
	case 'Start Test': // starting sensor reading plus LED warmup
		d = 6000;
		break;
	case 'Finish Test': // starting sensor reading plus LED warmup
		d = 6000;
		break;
	}
	// jscs:enable requireCamelCaseOrUpperCaseIdentifiers

	return d;
}

function bcodeEstimatedTime(bcodeArray) {
	var b, i;
	var duration = 0;

	for (i = 0; i < bcodeArray.length; i += 1) {
		b = bcodeArray[i];
		if (b) {
			if (b.command === 'Repeat') {
				duration += bcodeEstimatedTime(b.code) * parseInt(b.count);
			} else {
				duration += instructionTime(b.command, b.params);
			}
		}
	}

	return duration;
}

function paramString(params, keys) {
	return ',' + keys.map(function (key) {
		return params[key];
	}).join(',');
}

function compileInstruction(cmd, params) {
	var elem = getBcodeCommand(cmd);
	var keys = Object.keys(params);
	if (keys.length !== elem.params.length) {
		throw new Error('Parameter count mismatch, command: ' + cmd + ' should have ' + elem.params.length + ', has ' + keys.length);
	}
	return elem.num + (elem.params.length ? paramString(params, elem.params) : '') + '\t';
}

function compileRepeatBegin(count) {
	return '12,' + count + '\t';
}

function compileRepeatEnd() {
	return '13\t';
}

function bcodeCompileArray(bcodeArray) {
	var b, i;
	var compiledCode = '';

	for (i = 0; i < bcodeArray.length; i += 1) {
		b = bcodeArray[i];
		if (b) {
			if (b.command === 'Repeat') {
				compiledCode += compileRepeatBegin(b.count) + bcodeCompileArray(b.code) + compileRepeatEnd();
			} else {
				compiledCode += compileInstruction(b.command, b.params);
			}
		}
	}

	return compiledCode;
}

function bcodeDuration(bcode) {
	deviceParams = bcode.deviceParams;
	return parseInt(bcodeEstimatedTime(bcode.code) / 1000);
}

function bcodeCompile(bcode) {
	deviceParams = bcode.deviceParams;
	return bcodeCompileArray(bcode.code);
}

function generateTestString(cartridgeId, assay, testId) {
	var code = cartridgeId + '\t';
	var bcode, codeStr;

	code += testId + '\t';

	bcode = assay.BCODE;
	code += assay.duration + '\t';
	code += bcode.deviceParams.integrationTime + '\t';
	code += bcode.deviceParams.gain + '\t';
	code += bcode.deviceParams.ledPower + '\t';
	code += bcode.deviceParams.delayBetweenSensorReadings + '\t';

	codeStr = bcodeCompile(bcode);
	code += codeStr.length + '\t';
	code += '1\t'; // BCODE version
	code += codeStr;

	code += '\n';

	return code;
};

function saveDocument(context, doc) {
	var options = {
		uri: 'http://162.243.229.52:5984/master_brevitest/' + doc._id,
		method: 'PUT',
		auth: {
			username: context.secrets.USERNAME,
			password: context.secrets.PASSWORD
		},
        json: true,
        body: doc
	};
	return rp(options);
}

function getDocument(context, docId) {
	var options = {
		uri: 'http://162.243.229.52:5984/master_brevitest/' + docId,
		method: 'GET',
		auth: {
			username: context.secrets.USERNAME,
			password: context.secrets.PASSWORD
		}
	};
	return rp(options)
		.then(function (response) {
			return JSON.parse(response);
		})
}

function randHexDigits(len) {
    var i, result = '';
    for (i = 0; i < len; i += 1) {
        result += parseInt(Math.random() * 16).toString(16).toUpperCase();
    }
    return result;
}

function createTest(context, cartridge, assay) {
	console.log('Creating new test', cartridge, assay);
	var id = 'brevitst' + Date.now().toString() + randHexDigits(3);
    var test = {
        _id: id,
        schema: 'test',
        cartridge,
        assay,
		refNumber: 'Test auto-created by webtask',
        status: 'In queue',
		queuedOn: new Date()
    };

	return saveDocument(context, test)
		.then(function(response) {
			test._rev = response.rev;
			cartridge.testId = id;
			return saveDocument(context, cartridge);
		})
		.then(function(response) {
			cartridge._rev = response.rev;
			return test;
		});
}

module.exports =
	function (context, cb) {
		var cartridgeId = context.data.data;
		var testId = null;
		var cartridge = null;
		var assay = null;

		console.log('webtask_brevitest_validate');

		if (cartridgeId) {
			console.log(cartridgeId);
			getDocument(context, cartridgeId)
				.then(function (c) {
					cartridge = c;
					console.log(cartridge);
                    if (!cartridge) {
                        throw new Error('FAILURE' + cartridgeId + 'Cartridge not found');
					}
					if (!cartridge._id) {
                        throw new Error('FAILURE' + cartridgeId + 'Missing cartridge ID');
					}
					if (cartridge._id !== cartridgeId) {
                        throw new Error('FAILURE' + cartridgeId + 'Cartridge ID mismatch');
					}
					if (cartridge.used) {
                        throw new Error('FAILURE' + cartridgeId + 'Cartridge already used');
					}

					return getDocument(context, cartridgeId.slice(0, 8));
				})
				.then(function (a) {
					assay = a;
					if (!assay) {
						throw new Error('FAILURE' + cartridgeId + 'Assay not found');
					}
					if (!assay._id) {
						throw new Error('FAILURE' + cartridgeId + 'Missing assay ID');
					}
					if (assay._id !== cartridgeId.slice(0, 8)) {
                        throw new Error('FAILURE' + cartridgeId + 'Assay ID mismatch');
					}
					if (cartridge.testId) {
						console.log('cartridge.testId', cartridge.testId);
						return getDocument(context, cartridge.testId);
					}
					else {
						console.log('creating new test');
						return createTest(context, cartridge, assay);
					}
				})
				.then(function (test) {
					var responseString;
					if (!test) {
						throw new Error('FAILURE' + cartridgeId + 'Test record not found');
					}
					if (!test._id) {
						throw new Error('FAILURE' + cartridgeId + 'Missing test ID');
					}
					if (test._id !== cartridge.testId) {
                        throw new Error('FAILURE' + cartridgeId + 'Test ID mismatch');
					}
					if (test.status !== 'In queue') {
						throw new Error('FAILURE' + cartridgeId + 'Cartridge has not been queued');
					}
					responseString = 'SUCCESS' + generateTestString(cartridgeId, assay, test._id);
					console.log(responseString);
					cb(null, responseString);
				})
				.catch(function (error) {
					console.log(error);
					if (error.message && error.message.slice(0,7) === 'FAILURE') {
						cb(null, error.message);
					}
					else {
						if (error.statusCode && error.statusCode === 404) {
							cb(null, error.message);
						}
						else {
							cb('ERROR!!' + cartridgeId + error);
						}
					}
				})
		} else {
			cb(null, 'FAILURE' + cartridgeId + 'Cartridge ID not found');
		}

	};
