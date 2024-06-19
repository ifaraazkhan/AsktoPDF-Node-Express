import jwt from "jsonwebtoken";
import { selectSql, updateSql } from "./pg_helper.js";
import { schemaValidator } from "./validator_helper.js";
import error_resp from "../constants/errors.js";
import { createAuthToken } from "./helper.js";
import { ClerkExpressRequireAuth,ClerkExpressWithAuth } from '@clerk/clerk-sdk-node';
import "dotenv/config";

const PUBLIC_API = ""; //process.env.PUBLIC_API;


export const schemaValidation = async (req, res, next) => {
    if (req.method == 'POST') {
        let resp = await schemaValidator(req);
        if (resp.status_code == 'dc200') {
            next();
        } else {
            res.status(401).send(resp);
        }
    } else {
        next();
    }
}

export const validateSession = (req, res, next) => {
  ClerkExpressWithAuth()(req, res, async () => {
    try {
      const session = req.auth.sessionId;
      const userId = req.auth.userId;

      if (!session || !userId) {
        return res.status(401).send({ status_code: 'dc401', message: 'Unauthorized' });
      }
      
      // Store userId in the request object for later use
      req.userId = userId;
      next();
    } catch (error) {
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
};


export const fileFormatFilter = function (req, file, cb) {
    // Accept images only
    // let valid_formats = 'jpg|JPG|jpeg|JPEG|png|PNG|gif|GIF';
    // let expre = `/\.(${valid_formats})$/`
    if (!file.originalname.match(/\.(jpg|JPG|jpeg|JPEG|png|PNG|gif|GIF|doc|docx|pdf|xls|xlsx|svg|webp|jfif|msg|MSG|eml|EML|zip|ZIP|ppt|PPT|pptx|PPTX)$/)) {
        req.fileValidationError = 'Only image files are allowed!';
        return cb(null, true);
    }
    cb(null, true);
};
