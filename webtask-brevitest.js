var rp = require('request-promise-native');
var Particle = require('particle-api-js');
var particle = new Particle();

// test Comment

function login(context) {
	return particle.login({
		username: context.secrets.PARTICLE_USERNAME,
		password: context.secrets.PARTICLE_PASSWORD
	});
}

function getTestData(deviceId, token) {
	return particle.getVariable({
		deviceId: deviceId,
		name: 'register',
		auth: token
	});
}

function saveDocument(context, doc) {
	var options = {
		uri: 'http://brevitestdatabase.com:5984/master_brevitest/' + doc._id,
		method: 'PUT',
		auth: {
			username: context.secrets.COUCHDB_USERNAME,
			password: context.secrets.COUCHDB_PASSWORD
		},
        json: true,
        body: doc
	};
	return rp(options);
}

function getDocument(context, docId) {
	var options = {
		uri: 'http://brevitestdatabase.com:5984/master_brevitest/' + docId,
		method: 'GET',
		auth: {
			username: context.secrets.COUCHDB_USERNAME,
			password: context.secrets.COUCHDB_PASSWORD
		},
        json: true
	};
	return rp(options);
}

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
	name: 'Buzzer On',
	params: ['duration_ms', 'frequency'],
	description: 'Turns on the buzzer for a specified number of milliseconds at a specified frequency.'
}, {
	num: '5',
	name: 'Move Microns',
	params: ['microns', 'step_delay_us'],
	description: 'Moves the stage a specified number of microns at a specified speed expressed as a step delay in microseconds.'
}, {
	num: '6',
	name: 'Oscillate Stage',
	params: ['microns', 'step_delay_us', 'cycles'],
	description: 'Oscillates back and forth a given distance at a specified speed expressed as a step delay in microseconds.'
}, {
	num: '7',
	name: 'Read Sensor Baselines',
	params: [],
	description: 'Takes baseline readings from the sensors.'
}, {
	num: '8',
	name: 'Read Sensor Baselines With Parameters',
	params: ['param','led_power'],
	description: 'Takes baseline readings from the sensors with input parameters.'
}, {
	num: '9',
	name: 'Read Sensors',
	params: [],
	description: 'Takes readings from the sensors.'
}, {
	num: '10',
	name: 'Read Sensors With Parameters',
	params: ['param','led_power'],
	description: 'Read sensors with input parameters.'
}, {
	num: '11',
	name: 'Repeat Uninterrupted',
	params: ['count'],
	description: 'Repeats the block of BCODE without interruption.'
}, {
	num: '12',
	name: 'Repeat',
	params: ['count'],
	description: 'Repeats the block of BCODE.'
}, {
	num: '14',
	name: 'Set Heat Target',
	params: ['tempC10X'],
	description: 'Set the heating element target temperature to a specified level in Celsius (scaled 10X, so 51.4˚C is entered as 514).'
}, {
	num: '15',
	name: 'Move To Start Position',
	params: [],
	description: 'Move stage to the starting position.'
}, {
	num: '16',
	name: 'Move To Position',
	params: ['position', 'step_delay_us'],
	description: 'Move stage to a fixed position at a specified speed expressed as a step delay in microseconds.'
}, {
	num: '17',
	name: 'Raster Well',
	params: [
		'total_steps',
		'step_delay_us',
		'number_of_rasters',
		'number_of_firings',
		'gather_time_ms',
		'segments'
	],
	description: 'Rasters a well.'
}, {
	num: '18',
	name: 'Well Transit',
	params: [
		'step_delay_us',
		'gather_time_ms',
		'segments'
	],
	description: 'Well to well transit.'
}, {
	num: '19',
	name: 'Reserved19',
	params: [],
	description: 'Reserved for future use.'
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
	var s = 0;
	var i, j;
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
	case 'Buzzer On': // blink device LED
		d = parseInt(params.duration_ms);
		break;
	case 'Move Microns': // move microns
		d = Math.floor(Math.abs(parseInt(params.microns)) * parseInt(params.step_delay_us) / 25000);
		break;
	case 'Oscillate Stage': // oscillate
		d = Math.floor(2 * parseInt(params.cycles) * Math.abs(parseInt(params.microns)) * parseInt(params.step_delay_us) / 25000);
		break;
	case 'Read Sensor Baselines': // read Sensors
	case 'Read Sensor Baselines With Parameters':
	case 'Read Sensors': // read Sensors
	case 'Read Sensors With Parameters':
		d = 6000;
		break;
	case 'Heat Pulse':
		d = parseInt(params.duration);
		break;
	case 'Raster Well':
  		d = parseInt(params.gather_time_ms + Math.abs(params.total_steps) * params.step_delay_us / 1000);
  		s = 0;
		for (i = 0; i < params.number_of_firings; i += 1) {
			j = Math.min(i, params.segments.length - 1);
			s += params.segments[j].energize_ms + params.segments[j].delay_ms;
  		}
  		d += s *  params.number_of_rasters;
  		break;
    case 'Well Transit':
  		d = parseInt(params.gather_time_ms);
  		d += params.segments.reduce(function(a, v) {
  			return a + v.delay_ms + Math.abs(v.steps) * params.step_delay_us / 1000;
  		}, 0);
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
			if (b.command === 'Repeat' || b.command === 'Repeat Uninterrupted') {
				duration += bcodeEstimatedTime(b.code) * parseInt(b.count);
			} else {
				duration += instructionTime(b.command, b.params);
			}
		}
	}

	return duration;
}

function paramString(params, keys) {
	return ',' + keys.map(function(key) {
		return params[key];
	}).join(',');
}

function compileInstruction(cmd, args) {
	var command = getBcodeCommand(cmd);
	var argKeys = Object.keys(args).filter(function(k) {
		return k !== 'comment';
	});
	if (command.params.length !== argKeys.length) {
		throw new Error('Parameter count mismatch, command: ' + cmd + ' should have ' + command.params.length + ', has ' + argKeys.length);
	}
	return command.num + (argKeys.length ? paramString(args, argKeys) : '') + '\t';
}

function compileRepeatUninterruptedBegin(count) {
	return '11,' + count + '\t';
}

function compileRepeatBegin(count) {
	return '12,' + count + '\t';
}

function compileRepeatEnd() {
	return '13\t';
}

function compileRasterWell(params) {
	// jscs:disable requireCamelCaseOrUpperCaseIdentifiers
  var s;
  var code = compileInstruction('Raster Well', {
	  'total_steps': params.total_steps,
	  'step_delay_us': params.step_delay_us,
	  'number_of_rasters': params.number_of_rasters,
	  'number_of_firings': params.number_of_firings,
	  'gather_time_ms': params.gather_time_ms,
  	  'segments': params.segments.length,
  });
  code = code.slice(0, -1) + ',';

  for (s = 0; s < params.segments.length; s += 1) {
	  code += params.segments[s].energize_ms + ',';
	  code += params.segments[s].delay_ms + ',';
  }
  return code.slice(0, -1) + '\t';
  // jscs:enable requireCamelCaseOrUpperCaseIdentifiers
}

function compileWellTransit(params) {
	// jscs:disable requireCamelCaseOrUpperCaseIdentifiers
  var s;
  var code = compileInstruction('Well Transit', {
	  'step_delay_us': params.step_delay_us,
	  'gather_time_ms': params.gather_time_ms,
	  'segments': params.segments.length,
  });
  code = code.slice(0, -1) + ',';

  for (s = 0; s < params.segments.length; s += 1) {
	  code += params.segments[s].count + ',';
	  code += params.segments[s].steps + ',';
	  code += params.segments[s].delay_ms + ',';
  }
  return code.slice(0, -1) + '\t';
  // jscs:enable requireCamelCaseOrUpperCaseIdentifiers
}

function bcodeCompileArray(bcodeArray) {
	var b, i;
	var compiledCode = '';

	for (i = 0; i < bcodeArray.length; i += 1) {
		b = bcodeArray[i];
		if (b) {
			if (b.command !== 'Comment') {
				if (b.command === 'Repeat') {
					compiledCode += compileRepeatBegin(b.count) + bcodeCompileArray(b.code) + compileRepeatEnd();
				} else if (b.command === 'Raster Well') {
					compiledCode += compileRasterWell(b.params);
				} else if (b.command === 'Well Transit') {
					compiledCode += compileWellTransit(b.params);
				} else {
					if (b.command === 'Repeat Uninterrupted') {
						compiledCode += compileRepeatUninterruptedBegin(b.count) + bcodeCompileArray(b.code) + compileRepeatEnd();
					} else {
						compiledCode += compileInstruction(b.command, b.params);
					}
				}
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

var crc32tab = [
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

function checksum(str) {
    var crc = ~0, i, l;
    for (i = 0, l = str.length; i < l; i++) {
        crc = (crc >>> 8) ^ crc32tab[(crc ^ str.charCodeAt(i)) & 0xff];
    }
    crc = Math.abs(crc ^ -1);
    return crc;
}

function generateTestString(cartridgeId, assay, testId) {
	var code = cartridgeId + '\n';
	var bcode, codeStr;

	code += testId + '\t';

	bcode = assay.BCODE;
	code += assay.duration + '\t';
	code += bcode.deviceParams.integrationTime + '\t';
	code += bcode.deviceParams.gain + '\t';
	code += bcode.deviceParams.ledPower + '\t';
	code += bcode.deviceParams.delayBetweenSensorReadings + '\t';

	codeStr = bcodeCompile(bcode);
	code += (codeStr.length + 1).toString() + '\t';
	code += '1\t'; // BCODE version
	code += checksum(codeStr.slice(0, -1)) + '\t'; // BCODE checksum
	code += codeStr;

	code += '\n';

	return code;
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
        cartridge: cartridge,
        assay: assay,
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

function validate_cartridge(context, cb, cartridgeId) {
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
					throw new Error('FAILURE\n' + cartridgeId + '\nCartridge not found');
				}
				if (!cartridge._id) {
					throw new Error('FAILURE\n' + cartridgeId + '\nMissing cartridge ID');
				}
				if (cartridge._id !== cartridgeId) {
					throw new Error('FAILURE\n' + cartridgeId + '\nCartridge ID mismatch');
				}
				if (cartridge.used) {
					throw new Error('FAILURE\n' + cartridgeId + '\nCartridge already used');
				}

				return getDocument(context, cartridgeId.slice(0, 8));
			})
			.then(function (a) {
				assay = a;
				if (!assay) {
					throw new Error('FAILURE\n' + cartridgeId + '\nAssay not found');
				}
				if (!assay._id) {
					throw new Error('FAILURE\n' + cartridgeId + '\nMissing assay ID');
				}
				if (assay._id !== cartridgeId.slice(0, 8)) {
					throw new Error('FAILURE\n' + cartridgeId + '\nAssay ID mismatch');
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
					throw new Error('FAILURE\n' + cartridgeId + '\nTest record not found');
				}
				if (!test._id) {
					throw new Error('FAILURE\n' + cartridgeId + '\nMissing test ID');
				}
				if (test._id !== cartridge.testId) {
					throw new Error('FAILURE\n' + cartridgeId + '\nTest ID mismatch');
				}
				if (test.status !== 'In queue') {
					throw new Error('FAILURE\n' + cartridgeId + '\nCartridge has not been queued');
				}
				responseString = generateTestString(cartridgeId, assay, test._id);
				console.log('validate-cartridge', 'SUCCESS', responseString);
				send_response(context, cb, 'validate-cartridge', 'SUCCESS', responseString);
			})
			.catch(function (error) {
				console.log(error);
				if (error.message && error.message.slice(0,7) === 'FAILURE') {
					send_response(context, cb, 'validate-cartridge', 'FAILURE', error.message.slice(8));
				}
				else {
					if (error.statusCode && error.statusCode === 404) {
						send_response(context, cb, 'validate-cartridge', 'FAILURE', cartridgeId + '\n' + error.message.slice(8));
					}
					else {
						error.cartridgeId = cartridgeId;
						send_response(context, cb, 'validate-cartridge', 'ERROR', error);
					}
				}
			});
	} else {
		send_response(context, cb, 'validate-cartridge', 'FAILURE', cartridgeId + '\nCartridge ID not found');
	}
}

function start_test(context, cb, testId) {
	var cartridgeId, device;

	console.log('webtask_brevitest, test-start');
	console.log(testId);
	if (!context.body.coreid) {
		send_response(context, cb, 'test-start', 'FAILURE', testId + '\nNo device id found');
	}

	getDocument(context, context.body.coreid)
		.then(function(d) {
			if (!d) {
				throw new Error ('FAILURE\n' + context.body.coreid + '\nDevice not found');
			}
			device = d;

			if (!testId) {
				throw new Error('FAILURE\n' + testId + '\nNo test id found');
			}
			return getDocument(context, testId);
		})
		.then(function(test) {
			if (!test) {
				throw new Error ('FAILURE\n' + testId + '\nTest not found');
			}
			else if (!test.cartridge) {
				throw new Error ('FAILURE\n' + testId + '\nTest cartridge not found');
			}
			else if (!test.cartridge._id) {
				throw new Error ('FAILURE\n' + testId + '\nTest cartridge ID not found');
			}

			test.device = device;
			test.status = 'In progress';
			test.percentComplete = 0;
			test.startedOn = new Date();
			cartridgeId = test.cartridge._id;
			return saveDocument(context, test);
		})
		.then(function(response) {
			console.log(response);
			if (!response || !response.ok) {
				throw new Error ('FAILURE\n' + testId + '\nTest not saved');
			}
			return getDocument(context, cartridgeId);
		})
		.then(function(cartridge) {
			if (!cartridge) {
				throw new Error ('FAILURE\n' + testId + '\nCartridge not found');
			}
			cartridge.used = true;
			return saveDocument(context, cartridge);
		})
		.then(function(response) {
			console.log(response);
			if (!response || !response.ok) {
				throw new Error ('FAILURE\n' + testId + '\nTest not saved');
			}
			send_response(context, cb, 'test-start', 'SUCCESS', testId);
		})
		.catch(function(error) {
			console.log(error);
			if (error.message && error.message.slice(0,7) === 'FAILURE') {
				send_response(context, cb, 'test-start', 'FAILURE', error.message.slice(8));
			}
			else {
				error.testId = testId;
				send_response(context, cb, 'test-start', 'ERROR', error);
			}
		});
}

function finish_test(context, cb, testId) {
	var cartridgeId;

	console.log('webtask_brevitest, test-finish');

	if (!testId) {
		send_response(context, cb, 'test-finish', 'FAILURE', 'No test id');
	}
	else {
		getDocument(context, testId)
			.then(function(test) {
				if (!test) {
					throw new Error ('FAILURE\n' + testId + '\nTest not found');
				}
				if (!test.cartridge) {
					throw new Error ('FAILURE\n' + testId + '\nTest cartridge not found');
				}
				if (!test.cartridge._id) {
					throw new Error ('FAILURE\n' + testId + '\nTest cartridge ID not found');
				}

				test.status = 'Awaiting results';
				test.percentComplete = 100;
				test.finishedOn = new Date();

				console.log('completed test', test);
				return saveDocument(context, test);
			})
			.then(function(response) {
				console.log(response);
				if (!response || !response.ok) {
					throw new Error ('FAILURE\n' + testId + '\nTest not saved');
				}
				send_response(context, cb, 'test-finish', 'SUCCESS', testId);
			})
			.catch(function(error) {
				console.log(error);
				if (error.message && error.message.slice(0,7) === 'FAILURE') {
					send_response(context, cb, 'test-finish', 'FAILURE', error.message.slice(8));
				}
				else {
					error.testId = testId;
					send_response(context, cb, 'test-finish', 'ERROR', error);
				}
			});
	}
}

function cancel_test(context, cb, testId) {
	var cartridgeId;

	console.log('webtask_brevitest, test-cancel');

	if (!testId) {
		send_response(context, cb, 'test-cancel', 'FAILURE', 'No test id');
	}
	else {
		getDocument(context, testId)
			.then(function(test) {
				if (!test) {
					throw new Error ('FAILURE\n' + testId + '\nTest not found');
				}
				if (!test.cartridge) {
					throw new Error ('FAILURE\n' + testId + '\nTest cartridge not found');
				}
				if (!test.cartridge._id) {
					throw new Error ('FAILURE\n' + testId + '\nTest cartridge ID not found');
				}

				test.status = 'Cancelled';
				test.finishedOn = new Date();

				console.log('cancelled test', test);
				return saveDocument(context, test);
			})
			.then(function(response) {
				console.log(response);
				if (!response || !response.ok) {
					throw new Error ('FAILURE\n' + testId + '\nTest not saved');
				}
				send_response(context, cb, 'test-cancel', 'SUCCESS', testId);
			})
			.catch(function(error) {
				console.log(error);
				if (error.message && error.message.slice(0,7) === 'FAILURE') {
					send_response(context, cb, 'test-cancel', 'FAILURE', error.message.slice(8));
				}
				else {
					error.testId = testId;
					send_response(context, cb, 'test-cancel', 'ERROR', error);
				}
			});
	}
}

function parseReading(line) {
	var attr = line.split('\t');
	if (attr.length === 8) {
		return {
			channel: attr[0],
			time: Date(parseInt(attr[1])),
			red_mean: parseInt(attr[2]),
			green_mean: parseInt(attr[3]),
			blue_mean: parseInt(attr[4]),
			clear_mean: parseInt(attr[5]),
			clear_max: parseInt(attr[6]),
			clear_min: parseInt(attr[7])
		};
	}
	else {
		return {
			channel: attr[0],
			time: Date(parseInt(attr[1])),
			x: parseInt(attr[2]),
			y: parseInt(attr[3]),
			z: parseInt(attr[4]),
			temperature: parseInt(attr[5])
		};
	}
}

function parseData(str, testId) {
    var attr, i, lines;
    var result = {};

	lines = str.split('\n');
    attr = lines[0].split('\t');
    result.startedOn = Date(parseInt(attr[0]));
    result.finishedOn = Date(parseInt(attr[1]));
	result.testId = attr[2];
	if (attr.length > 3) {
		result.assayLEDBaseline = attr[3];
		result.controlLEDBaseline = attr[4];
	}
	result.number_of_readings = lines.length - 2;
	result.readings = [];
	for (i = 0; i < result.number_of_readings; i += 1) {
		result.readings.push(parseReading(lines[i + 1]));
	}
    return result;
}

function square(a) {
	return a * a;
}

function xyzDiff(r1, r2) {
	return Math.sqrt(square(r1.x - r2.x) + square(r1.y - r2.y) + square(r1.z - r2.z));
}

function calculateResults(data) {
	if (data.length !== 4) {
		return 'Invalid result - more than two readings of two channels';
	}
	if (!data[0].x) {
		return 'Invalid result - sensor readings not found';
	}

	return Math.round(100000 * (xyzDiff(data[1], data[3]) - xyzDiff(data[0], data[2])), 0);
};

function upload_test(context, cb, testId) {
	var token, result;
	var deviceId = context.body.coreid;

	console.log('webtask_brevitest, upload-test');

	if (!deviceId) {
		send_response(context, cb, 'test-upload', 'FAILURE', 'No device id');
	}
	else if (!testId) {
		send_response(context, cb, 'test-upload', 'FAILURE', 'No test id');
	}
	else {
		login(context)
		  .then(function(response) {
			  token = response.body.access_token;
			  return getTestData(deviceId, token);
		  })
		  .then(function(response) {
			  if (!response || !response.body || !response.body.result) {
				throw new Error('FAILURE\n' + testId + '\nUnable to get test data from device');
			  }
			  result = parseData(response.body.result, testId);
			  if (result.testId !== testId) {
				throw new Error('FAILURE\n' + testId + '\nTest ID in device does not match test ID requested');
			  }
			  delete result.testId;
			  return getDocument(context, testId);
		  })
		  .then(function(test) {
			  if (!test) {
				throw new Error('FAILURE\n' + testId + '\nTest not found');
			  }
			  test.rawData = result;
			  if (result && result.readings) {
				  test.readout = calculateResults(test.rawData.readings);
			  }
			  else {
				  test.readout = '';
			  }
			  if (typeof test.readout !== 'number') {
				  test.result = 'Unknown';
			  }
			  else if (test.readout > test.assay.standardCurve.cutScores.redMax || test.readout < test.assay.standardCurve.cutScores.redMin) {
				  test.result = 'Positive';
			  }
			  else if (test.readout > test.assay.standardCurve.cutScores.greenMax || test.readout < test.assay.standardCurve.cutScores.greenMin) {
				  test.result = 'Borderline';
			  }
			  else {
				  test.result = 'Negative';
			  }
		  	  test.status = 'Complete';
			  console.log(test);
			  return saveDocument(context, test);
		  })
		  .then(function(response) {
			  console.log(response);
			  if (!response || !response.ok) {
				throw new Error('FAILURE\n' + testId + '\nTest not saved');
			  }
			  send_response(context, cb, 'test-upload', 'SUCCESS', testId);
		  })
		  .catch(function(error) {
			  if (error.message && error.message.slice(0,7) === 'FAILURE') {
				  send_response(context, cb, 'test-upload', 'FAILURE', error.message.slice(8));
			  }
			  else {
				  error.testId = testId;
				  send_response(context, cb, 'test-upload', 'ERROR', error);
			  }
		  });
	}
}

function locate_device(context, cb, data) {
	var result;
	getDocument(context, context.body.coreid)
		.then(function(device) {
			if (!device) {
				throw new Error ('FAILURE\n' + context.body.coreid + '\nDevice not found');
			}

			var params = data.split(',');
			var whenDate = params[0].split('/');
			var whenTime = params[1].split(':');
			var when = new Date(parseInt(whenDate[2]),parseInt(whenDate[0]),parseInt(whenDate[1]),parseInt(whenTime[0]),parseInt(whenTime[1]),parseInt(whenTime[2]));
			var lat = parseFloat(params[2].slice(4));
			var long = parseFloat(params[3].slice(5));
			result = {
				when: when,
				latitude: lat,
				longitude: long,
				uncertainty: parseFloat(params[5].slice(12))
			};
			device.latestLocation = result;

			return saveDocument(context, device);
		})
		.then(function(response) {
			console.log(response);
			if (!response || !response.ok) {
			  throw new Error('FAILURE\n' + context.body.coreid + '\Device location not updated');
			}
			send_response(context, cb, 'device-location', 'SUCCESS', context.body.coreid + '\n' + result.when + '\t' + result.latitude + '\t' + result.longitude + '\t' + result.uncertainty);
		})
		.catch(function(error) {
			if (error.message && error.message.slice(0,7) === 'FAILURE') {
				send_response(context, cb, 'device-location', 'FAILURE', error.message.slice(8));
			}
			else {
				send_response(context, cb, 'device-location', 'ERROR', error);
			}
		});
}

function register_device(context, cb, data) {
	var result;
	getDocument(context, context.body.coreid)
		.then(function(device) {
			if (!device) {
				throw new Error ('FAILURE\n' + context.body.coreid + '\nDevice not found');
			}

			var params = data.split(',');
			var whenDate = params[0].split('/');
			var whenTime = params[1].split(':');
			var when = new Date(parseInt(whenDate[2]),parseInt(whenDate[0]),parseInt(whenDate[1]),parseInt(whenTime[0]),parseInt(whenTime[1]),parseInt(whenTime[2]));
			var lat = parseFloat(params[2].slice(4));
			var long = parseFloat(params[3].slice(5));
			result = {
				when: when,
				latitude: lat,
				longitude: long,
				uncertainty: parseFloat(params[5].slice(12))
			};
			device.latestLocation = result;

			return saveDocument(context, device);
		})
		.then(function(response) {
			console.log(response);
			if (!response || !response.ok) {
			  throw new Error('FAILURE\n' + context.body.coreid + '\Device location not updated');
			}
			send_response(context, cb, 'device-location', 'SUCCESS', context.body.coreid + '\n' + result.when + '\t' + result.latitude + '\t' + result.longitude + '\t' + result.uncertainty);
		})
		.catch(function(error) {
			if (error.message && error.message.slice(0,7) === 'FAILURE') {
				send_response(context, cb, 'device-location', 'FAILURE', error.message.slice(8));
			}
			else {
				send_response(context, cb, 'device-location', 'ERROR', error);
			}
		});
}
function write_log(context, event_name, event_type, data) {
	console.log('Creating new log entry', event_name);
	var d = new Date();
	var id = 'log_' + d.toISOString();
    var log_entry = {
        _id: id,
        schema: 'log',
		loggedOn: d,
		event: event_name,
		type: event_type,
        data: data
    };

	return saveDocument(context, log_entry);
}

function send_response(context, cb_fcn, event_name, event_type, data) {
	var response = 	event_name + '\n' + event_type + '\n';

	if (typeof(data) === 'object') {
		response += JSON.stringify(data) + '\n';
	}
	else {
		response += data + '\n';
	}

	write_log(context, event_name, event_type, data);

	console.log('response', response);
	if (event_type === 'ERROR') {
		cb_fcn(response);
	}
	else {
		cb_fcn(null, response);
	}
}

module.exports =
	function (context, cb) {
	  console.log('context', context);
		var indx = context.body.data.indexOf('\n');
		var event_name = context.body.data.slice(0, indx);
		var data = context.body.data.slice(indx + 1);

		write_log(context, event_name, 'REQUEST', data);
		switch (event_name) {
			case 'register-device':
				register_device(context, cb, data);
				break;
			case 'validate-cartridge':
				validate_cartridge(context, cb, data);
				break;
			case 'test-start':
				start_test(context, cb, data);
				break;
			case 'test-finish':
				finish_test(context, cb, data);
				break;
			case 'test-cancel':
				cancel_test(context, cb, data);
				break;
			case 'test-upload':
				upload_test(context, cb, data);
				break;
			case 'device-location':
				locate_device(context, cb, data);
				break;
			default:
				send_response(context, cb, event_name, 'FAILURE', 'Event not found\n' + data);
		}

	};
