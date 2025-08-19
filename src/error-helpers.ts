/********************************************************************************
 *   Ledger Node JS API
 *   (c) 2016-2017 Ledger
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 ********************************************************************************/
import { ShellErrorConstructor, To } from "./types/error-types";

const errorClasses: any = {};
const deserializers: any = {};

const isObject = (value: any) : boolean => {
  return typeof value === "object";
}

export const addCustomErrorDeserializer = (name: string, deserializer: (obj: any) => any) : void => {
  deserializers[name] = deserializer;
};

export const createCustomErrorClass = <F extends { [key: string]: unknown },  T extends ShellErrorConstructor<F>> ( name: string): T => {
  class CustomErrorClass extends Error {
    cause?: Error;
    constructor(message?: string, fields?: F, options?: any) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      super(message || name, options);
      // Set the prototype explicitly. See https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins-like-error-array-and-map-may-no-longer-work
      Object.setPrototypeOf(this, CustomErrorClass.prototype);
      this.name = name;
      if (fields) {
        for (const k in fields) {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          this[k] = fields[k];
        }
      }
      if (options && isObject(options) && "cause" in options && !("cause" in this)) {
        // .cause was specified but the superconstructor
        // did not create an instance property.
        const cause = options.cause;
        this.cause = cause;
        if ("stack" in cause) {
          this.stack = this.stack + "\nCAUSE: " + cause.stack;
        }
      }
    }
  }

  errorClasses[name] = CustomErrorClass;

  return CustomErrorClass as unknown as T;
};

// inspired from https://github.com/programble/errio/blob/master/index.js
export const deserializeError = (object: any): Error | undefined => {
  if (object && typeof object === "object") {
    try {
      if (typeof object.message === "string") {
        const msg = JSON.parse(object.message);
        if (msg.message && msg.name) {
          object = msg;
        }
      }
    } catch (e) {
      // nothing
    }

    let error;
    if (typeof object.name === "string") {
      const { name } = object;
      const des = deserializers[name];
      if (des) {
        error = des(object);
      } else {
        let constructor = name === "Error" ? Error : errorClasses[name];

        if (!constructor) {
          console.warn("deserializing an unknown class '" + name + "'");
          constructor = createCustomErrorClass(name);
        }

        error = Object.create(constructor.prototype);
        try {
          for (const prop in object) {
            if (object.hasOwnProperty(prop)) {
              error[prop] = object[prop];
            }
          }
        } catch (e) {
          // sometimes setting a property can fail (e.g. .name)
        }
      }
    } else {
      if (typeof object.message === "string") {
        error = new Error(object.message);
      }
    }

    if (error && !error.stack && Error.captureStackTrace) {
      Error.captureStackTrace(error, deserializeError);
    }
    return error;
  }
  return new Error(String(object));
};

// inspired from https://github.com/sindresorhus/serialize-error/blob/master/index.js
export const serializeError = (value: undefined | To | string | (() => unknown)): undefined | To | string => {
  if (!value) return value;
  if (typeof value === "object") {
    return destroyCircular(value, []);
  }
  if (typeof value === "function") {
    return `[Function: ${value.name || "anonymous"}]`;
  }
  return value;
};

// https://www.npmjs.com/package/destroy-circular
const destroyCircular = (from: any, seen: Array<any>): To => {
  const to: any = {};
  seen.push(from);
  for (const key of Object.keys(from)) {
    const value = from[key as keyof typeof from];

    if (typeof value === "function") {
      continue;
    }

    if (!value || typeof value !== "object") {
      to[key as keyof typeof from] = value;
      continue;
    }

    if (seen.indexOf(from[key as keyof typeof from]) === -1) {
      to[key] = destroyCircular(from[key as keyof typeof from], seen.slice(0));
      continue;
    }

    to[key] = "[Circular]";
  }
  if (typeof from.name === "string") {
    to.name = from.name;
  }
  if (typeof from.message === "string") {
    to.message = from.message;
  }
  if (typeof from.stack === "string") {
    to.stack = from.stack;
  }
  return to;
}