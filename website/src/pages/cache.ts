import {
    Cache,
} from "o1js";

export const fetchFiles = async () => {
    const filesResponse = await fetch("http://localhost:3000/compiled.json");
    const json = await filesResponse.json();
    //const files = JSON.parse(json);
    console.log("json");
    return Promise.all(json.map((file) => {
        return Promise.all([
            fetch(`http://localhost:3000/cache/${file}`).then(res => res.text())
        ]).then(([data]) => ({ file, data }));
    }))
        .then((cacheList) => cacheList.reduce((acc: any, { file, data }) => {
            acc[file] = { file, data };

            return acc;
        }, {}));
}

export const readCache = (files: any): Cache => ({
    read({ persistentId, uniqueId, dataType }: any) {
        // read current uniqueId, return data if it matches
        if (!files[persistentId]) {
            return undefined;
        }

        if (dataType === 'string') {
            return new TextEncoder().encode(files[persistentId].data);
        }
        // else {
        //   let buffer = readFileSync(resolve(cacheDirectory, persistentId));
        //   return new Uint8Array(buffer.buffer);
        // }

        return undefined;
    },
    write({ persistentId, uniqueId, dataType }: any, data: any) {
        console.log('write');
        console.log({ persistentId, uniqueId, dataType });
    },
    canWrite: true,
});