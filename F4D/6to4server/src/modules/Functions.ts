export function checkPkg(raw: string): boolean {


  if (raw.trim().startsWith('{') && raw.trim().endsWith('}')) {
    console.log('The package is valid');
    return true;
  } else {
    return false;
  }
}

export function isPing(str: string): boolean {
  str = str.trim();
  if (str.includes('PING')) {
    return true;
  } else {
    return false;
  }
}

export function getIpv6byPing(raw:string):string{
  const colonIndex = raw.indexOf(":")+2; // find the index of ":"
  // slice the string from the index of ":" to the end of the string
  const LLA = raw.slice(colonIndex).trim();
  return LLA;
  // return raw.slice(12).trim();
}

export function updateExpId(list:any[], newExpId:number) :any[] {
  return list.map(item => {
    return {
      ...item,
      ExperimentData: {
        ...item.ExperimentData,
        Exp_id: newExpId
      }
    };
  });
}