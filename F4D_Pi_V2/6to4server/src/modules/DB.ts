import {InfluxDB, Point } from '@influxdata/influxdb-client';
import { BlackBox, Conf } from './Models';

export function saveToBlackBox(packets: Point[]): void {
  const writeApi = BlackBox.getWriteApi(
    Conf.BlackBox.org,
    Conf.BlackBox.bucket,
    's',
  );
  // writeApi.useDefaultTags({ host: 'wsn1' });
  writeApi.writePoints(packets);
  writeApi
    .close()
    .then(() => {
      console.log('[FieldArr@y-BlackBox] successfully saved .\n');
    })
    .catch((e: any) => {
      console.error(e);
      console.log('\\nFinished ERROR');
    });
}

// function to query data from the influxDB based on the experiment name

export async function queryFromBlackBox(expName: string) {
  const url = Conf.BlackBox.url;
  const token = Conf.BlackBox.token;
  const org = Conf.BlackBox.org;
  console.log('queryFromBlackBox - InfluxDB configuration:', url, token, org);

  /** 
   * intisiates the influxDB client with configuration
   */
  const queryAPI = new InfluxDB({ url, token }).getQueryApi(org);
  console.log('queryFromBlackBox - Querying data from InfluxDB');
  console.log(Conf.BlackBox.bucket,expName)
  const fluxQuery = `
  from(bucket: "${Conf.BlackBox.bucket}")
    |> range(start: 0) 
    |> filter(fn: (r) => r["Exp_Name"] == "${expName}")
    |> aggregateWindow(every: 3m, fn: mean, createEmpty: false)
    |> yield(name: "mean")
`;

  let csvData = "date,exp_name,LLA,field,measurements\n"; // CSV Header

  try {
    for await (const {values, tableMeta} of queryAPI.iterateRows(fluxQuery)) {
      const o = tableMeta.toObject(values);
      csvData += `${o._time},${expName},${o._measurement},${o._field},${o._value}\n`;
    }
    return csvData;
  } catch (e) {
    console.error(e);
    return ''; // Return an empty string in case of an error
  }

}