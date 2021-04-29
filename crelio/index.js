const axios = require('axios');
const uuid = require('uuid');

axios.defaults.baseURL = process.env.COUCHDB_URL;
axios.defaults.headers.common['Authorization'] = process.env.COUCHDB_BASE64_AUTH;

const ITEM_DELIM = '|';
const END_DELIM = "#";

// const getStatus = (status) => status === 200 || status === 304;
// const verifyStatus = (status) => status === 200 || status === 404;
const putStatus = (status) => status === 201 || status === 202;
const postStatus = (status) => status === 200 || status === 201;

const saveDocument = (doc) => {
    const config = { validateStatus: putStatus };
    return axios.put(`/${doc._id}`, { ...doc }, config);
};

const saveMultipleDocs = (docs) => {
    const config = { validateStatus: postStatus };
    return axios.post(`/_bulk_docs`, { docs }, config);
};

// const getDocumentById = (docId) => {
//     const config = {
//         params: { include_docs: true },
//         validateStatus: getStatus
//     };
//     return axios.get(`/${docId}`, config);
// };

// const getDocumentView = (ddoc, view, key) => {
//     const config = {
//         params: { include_docs: true, key: `"${key}"` },
//         validateStatus: getStatus
//     };
//     return axios
//         .get(`/_design/${ddoc}/_view/${view}`, config)
//         .then((response) => {
//             const rows = response.data.rows;
//             if (!rows) {
//                 throw new Error(`Missing data for ${key}!`);
//             } else if (rows.length === 0) {
//                 throw new Error(`${key} not found in database!`);
//             } else if (rows.length > 1) {
//                 throw new Error(`${rows.length} records for ${key} found - only 1 allowed!`);
//             }
//             return  rows[0].doc;
//         });
// };

const parseData = (data) => {
    const when = new Date().toISOString().slice(0, 19);
    const samples = [];
    const orders = data.labReportDetails.map((test) => {
        const index = samples.findIndex((sample) => sample.accessionNumber === test.accessionNo);
        if (index === -1) {
            samples.push({
                _id: uuid.v4(),
                schema: 'sample',
                status: 'unused',
                type: 'clinical',
                sampleId: test.accessionNo,
                requisitionNumber: data.billId,
                takenOn: test.sampleDate,
                matrix: test.sampleType,
                notes: test.sampleComments,
                siteId: 'C0000001',
                checkpoints: {
                    created: { when, who: 'brevitest-crelio', where: 'aws-lambda' }
                }
            });
        }
        const sampleId = index === -1 ? samples[samples.length - 1]._id : samples[index]._id;
        return {
            _id: uuid.v4(),
            schema: 'order',
            status: 'open',
            orderId: test.labReportId,
            patientId: test.patientId,
            orderDate: test.reportDate,
            sampleId,
            requisitionNumber: data.billId,
            assayId: test.testCode,
            siteId: 'C0000001',
            checkpoints: {
                created: { when, who: 'brevitest-crelio', where: 'aws-lambda' }
            }
        };
    });
    return { orders, samples };
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

const send_response = (callback, data) => {
    const response = {
		statusCode: 200,
        headers: {
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS,POST'
        },
    	"isBase64Encoded": false
    };

	write_log(null, 'crelio-test', 'SUCCESS', data);
    const responseData = typeof data === 'object' ? JSON.stringify(data) : data;
    response.body = `crelio-test${ITEM_DELIM}SUCCESS${ITEM_DELIM}${responseData}${END_DELIM}`;

	callback(null, response);
};

exports.handler = (event, context, callback) => {
    const body = JSON.parse(event.body);
    const labReportDetails = body.labReportDetails.map((report) => {
        return {
            labReportId: report.labReportId.toString(),
            reportDate: report.reportDate,
            sampleDate: report.sampleDate,
            testCode: report.testCode,
            testId: report.testID,
            testName: report.testName,
            sampleType: report.sampleId.type,
            accessionNo: report.accessionNo,
            sampleComments: report.sampleComments
        };
    });
    const data = {
        apiKey: body.apiKey,
        apiUser: body.apiUser,
        patientId: body['patient ID'],
        billId: body.billId.toString(),
        labReportDetails
    };
    
    const docs = parseData(data);
    saveMultipleDocs([...docs.orders, ...docs.samples]);
    
    send_response(callback, docs);
};
