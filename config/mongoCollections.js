import {dbConnection} from './mongoConnection.js';


const getCollectionFn = (collection) => {
  let _col = undefined;

  return async () => {
    if (!_col) {
      const db = await dbConnection();
      _col = await db.collection(collection);
    }

    return _col;
  };
};

export const usersCollection = getCollectionFn('users');
export const stopsCollection = getCollectionFn('stops');
export const routesCollection = getCollectionFn('routes');
export const reportsCollection = getCollectionFn('reports');
export const delaysCollection = getCollectionFn('historical_delays');
