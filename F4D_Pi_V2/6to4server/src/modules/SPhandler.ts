// import { Isp } from './Interfaces'

// const spList: { [ipv6: string]: Isp } = {};
// let SPcount: number;
// export function addNewSP(sp: any): void {

//   spList[sp.ADDR] = { lastPackageID: sp.NUM, lastPackage: sp.DB, isFirstPackage: true };
//   SPcount = Object.keys(spList).length;
// };

// export const isNewSP = (sp: string): boolean => {
//   if (sp in spList) {
//     return false;
//   } else {
//     return true;
//   }
// };

// export function updateNewPackage(sp: any): void {
//   spList[sp.ADDR] = { lastPackageID: sp.NUM, lastPackage: sp.DB, isFirstPackage: false };
// };

// export const isNewPackage = (ipv6: string, pkg: number): boolean => {
//   if (pkg == spList[ipv6].lastPackageID) {
//     console.log(`[FALSE] This package id: ${pkg} equal the last package id: ${spList[ipv6].lastPackageID}\n`)
//     return false;
//   } else {
//     console.log(`[TRUE] This package id: ${pkg} not equal the last package id: ${spList[ipv6].lastPackageID}\n`)

//     return true;
//   }
// };

// export function showList(): void {
//   console.log(`Showing ${SPcount} SPs:\n`);
//   console.log(spList);
// }