"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.influxConfig = void 0;
exports.influxConfig = {
    Local: {
        token: 'ukrt-1OBAawssODCbFi1sRdcgU-73E91lbgC5pUhOd8CG_EPJaaXnHfG21OPvN9PIDswgr4s6Nr4TDlrTPTl6A==',
        org: 'fieldarray',
        bucket: 'blackbox',
        url: 'http://raspberrypi.local:8086',
    },
    Idan: {
        token: '6s62HGpZb0dsXFLycEI7wcOXwo6jFnufwPUG7OYvoakNfPK48hlkGjKS93QBA08HvVZI7cee__lG47fV6myhUw==',
        org: 'home',
        bucket: 'cloud',
        url: 'http://ifrachi.local:8086',
    },
    hujiCloud: {
        token: 'ru_-kGADQxlgZzixi7xMu0G22F3KPu-9y0p9tMttf0g4UYPRzHMS12p3820nFvW00NLOOaohJ6voYyfaQ_88MQ==',
        org: 'fieldarray',
        bucket: 'WSN1',
        url: 'http://128.139.16.245:8086',
    },
};
// export const writeOptions = {
//   /* the maximum points/line to send in a single batch to InfluxDB server */
//   batchSize: 1001,
//   /* default tags to add to every point */
//   defaultTags: { GW: "host_mac" },
//   /* maximum size of the retry buffer - it contains items that could not be sent for the first time */
//   maxBufferLines: 2958500,
//   /* the count of retries, the delays between retries follow an exponential backoff strategy if there is no Retry-After HTTP header */
//   maxRetries: 10,
//   /* maximum delay between retries in milliseconds */
//   maxRetryDelay: 3600000,
//   /* minimum delay between retries in milliseconds */
//   minRetryDelay: 120000, // minimum delay between retries
//   /* a random value of up to retryJitter is added when scheduling next retry */
//   retryJitter: 120000,
//   // ... or you can customize what to do on write failures when using a writeFailed fn, see the API docs for details
//   writeFailed: function (error, lines, failedAttempts) {
//     console.error(error)
//     if (failedAttempts > 5) {
//       try {
//         let array = fs.readFileSync('data.txt').toString().split("\n");
//         const reWriteApi = client.getWriteApi(org, bucket, 's', writeOptions);
//         reWriteApi.writeRecords(array);
//       } catch (e) {
//         console.error(e)
//         // console.log('\nFinished ERROR')
//       }
//     }
//   },
//   writeSuccess: (lines) => {
//     // sentToCloud = sentToCloud + lines.length;
//     // console.log(`\n [  ${totalPkg} total packages received,  ${savedThisSession} Saved locally,  ${sentToCloud} sent to cloud ,BlackBOX size `);
//     // console.log(`\n [ ${dayjs(new Date()).format('DD-MM-YYYY HH:mm')}] `);
//   }
// }
