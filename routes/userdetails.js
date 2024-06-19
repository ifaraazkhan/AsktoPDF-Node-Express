import express from 'express';
import { selectSql, insertSql, updateSql, RecordExist } from '../utils/pg_helper.js';
import { createAuthToken, generateOTP, sendOTP, validateOTP,checkSuperUserAccount } from '../utils/helper.js';
import { fileFormatFilter } from '../utils/middlewares.js';
import error_resp from '../constants/errors.js';
import sanitizer from 'sanitizer';
import email_service from '../utils/email_service.js';
import { encryptData } from '../utils/helper.js';
import { postRequest, getRequest } from '../utils/http_utility.js';
import path from 'path';
import e from 'express';
import url from 'url';
import https from 'https';
import fs from 'fs';
import request from 'request';
import md5 from 'md5';
import axios from 'axios';

const router = express.Router();


router.post('/startTest', async(req,res)=>{
  const {p_name,p_age,p_gender,test_id} = req.body;
  const userID = req.headers.user_id;
  console.log("startTest ---> ",p_name,p_age,p_gender,test_id);

  try {
  //   let sql = `select test_result_id from dc.test_details where user_id = $1 and status = 'pending'`;
  // let resp = await selectSql(sql,[userID]);
  // let testID = resp.results[0].test_result_id;

  // console.log(testID);
  let sql = `update dc.test_details set patient_name = $1, patient_age = $2, patient_gender = $3, test_date = now() 
  where user_id = $4 and test_result_id = $5`;
  console.log(sql);
  let resp = await updateSql(sql,[p_name,p_age,p_gender,userID,test_id]);

  res.send(resp);
    
  } catch (error) {
    res.status(500).send("Invalid Request");
  }
  

})

router.get('/getProfile', async(req,res)=>{
  const userID = req.headers.user_id;
  let sql = `select a.fullname,a.u_age,u.mobile,u.registration_no,u.ac_type_id from ai.account a , ai.users u where a.user_id = u.user_id and a.user_id = $1`;
  let resp = await selectSql(sql,[userID]);
  res.send(resp);

})

router.post('/updateProfile', async(req,res)=>{
  console.log('inside');
  const {fullname,u_age,password} = req.body;
  const userID = req.headers.user_id;

  let sql = `update ai.account set u_age = $1,fullname = $2 where user_id = $3`;
  let resp = await updateSql(sql,[u_age,fullname,userID]);

  if(password.trim() != '' || password != undefined){
    let password_ = md5(password);
    sql = `update ai.users set "password" = $1 where user_id = $2`;
    resp = await updateSql(sql,[password_,userID]);
  }
  res.send(resp);

})

router.get('/getReportbyID/:report_id', async(req,res)=>{
  const userID = req.headers.user_id;
  let reportID = req.params.report_id;

  let sql = `select result_id,p_name,p_age,p_gender,p_mobile,input_xray,api_result,TO_CHAR(created_at, 'DD/MM/YYYY') AS test_date from ai.user_test_results utr 
  where status = 'active' and result_id = $1 and user_id = $2`;
  let resp = await selectSql(sql,[reportID,userID]);
  res.send(resp);
})
router.get('/getMedicalRecords', async(req,res)=>{
  const userID = req.headers.user_id;

  let sql = `select patient_name,patient_age,patient_gender,TO_CHAR(test_date, 'DD Month YYYY') AS test_date,TO_CHAR(test_date, 'HH:MI AM') AS test_time,test_result_id from dc.test_details 
  where status = 'complete' and user_id = $1 order by test_result_id desc `;
  let resp = await selectSql(sql,[userID]);
  res.send(resp);

})

router.get('/searchRecords/:mobile', async(req,res)=>{
  const userID = req.headers.user_id;
  const mobileNumber = req.params.mobile;

  // check for records exist for mobilenumber searched 
  let sql = `select count(td.test_result_id) from dc.test_details td,dc.users u where td.user_id = u.user_id and  td.status = 'complete' and u.mobile = $1`;
  let resp = await selectSql(sql,[mobileNumber]);
  let count_ = resp.results[0].count;
  if(count_ == 0){
    res.status(401).send({ status_code: 'dc401', message: 'No reports found' });
  }
  else{
    // send OTP 
    let sendOTP = await generateOTP(mobileNumber,'search');
    res.status(200).send({ status_code: 'dc200',message:"success", results: `OTP send to ${mobileNumber}` });
  }

})

router.get('/getPatientRecords/:mobile/:otp', async(req,res)=>{
  const userID = req.headers.user_id;
  const mobileNumber = req.params.mobile;
  const OTP = req.params.otp;

  // validate otp 
  let validate = await validateOTP(mobileNumber,OTP,'search');
  if(validate == true){
    // get records by mobile number 
    let sql = `select td.patient_name,td.patient_age,td.patient_gender,TO_CHAR(td.test_date, 'DD Month YYYY') AS test_date,
    TO_CHAR(td.test_date, 'HH:MI AM') AS test_time,td.test_result_id
        from dc.test_details td, dc.users u  where td.user_id = u.user_id and td.status = 'complete' and u.mobile = $1 order by td.test_result_id desc`;
    let resp = await selectSql(sql,[mobileNumber]);
    res.send(resp);
  }else{
    res.status(401).send({ status_code: 'dc401', message: 'Invalid OTP' });
  }

})




router.post('/updateFeedback', async(req,res)=>{
  const {test_id,feedback} = req.body;
  const userID = req.headers.user_id;

  let sql = `update dc.test_details set test_feedback = $1 where status ='complete' and test_result_id = $2`;
  let resp = await updateSql(sql,[feedback,test_id]);
  res.send(resp);

});

router.get("/generate_pdf/:report_id", async (req, res) => {
  let testID = req.params.report_id;
  const userID = req.headers.user_id;
//check userID
let sqlcheck = ` select ac_type_id from dc.users u where user_id = $1`;
let check_res = await selectSql(sqlcheck,[userID]);
let account_type = check_res.results[0].ac_type_id;

  let report_date = "";
  let name = "";
  let age = "";
  let mobile = "";
  let result_data;
  let sql = `select u.user_id,u.mobile,td.patient_name,td.patient_age,td.patient_gender,TO_CHAR(td.test_date, 'DD Month YYYY') AS test_date,TO_CHAR(td.test_date, 'HH:MI AM') AS test_time,
td.test_result_id,td.assessment_result as test_result,td.test_feedback  from dc.test_details td , dc.users u
  where td.user_id = u.user_id and td.status = 'complete' and test_result_id  = $1 `;
  let resp = await selectSql(sql, [testID]);
  if (resp.results.length > 0 && (userID == resp.results[0].user_id || account_type == 2)) {
    report_date = resp.results[0].test_date;
    name = resp.results[0].patient_name;
    age = resp.results[0].patient_age;
    mobile = resp.results[0].mobile;
    result_data = resp.results[0].test_result;

    // Create a new PDF document
    const doc = new PDFDocument({ size: "A4" });

    // Set the response headers for PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=report.pdf");

    // Pipe the PDF document to the response
    doc.pipe(res);

    // Specify the file path relative to your Node.js script
    const imagePath = "./assets/logo.png";

    // Read the image file synchronously
    const imageData = fs.readFileSync(imagePath);

    // Calculate image dimensions and positioning
    const imageWidth = 500; // Replace with actual image width
    const imageHeight = 500; // Replace with actual image height
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const imageX = (pageWidth - imageWidth) / 2;
    const imageY = (pageHeight - imageHeight) / 2;

    // Generate the PDF content

    // Set font size variables for easy customization
    const mainheadingFontSize = 25;
    const headingFontSize = 18;
    const subHeadingFontSize = 12;
    const textFontSize = 14;

    // Add heading
    doc
      .fontSize(mainheadingFontSize)
      .text("Assessment Report", { align: "center", bold: true });

    // Add Report ID
    doc.moveDown(2);
    doc
      .fontSize(headingFontSize)
      .text("Report ID - #" + req.params.report_id, { indent: 5 });

    // Add date
    doc.fontSize(subHeadingFontSize).text(report_date, { indent: 5 });

    // Add horizontal line
    doc.moveDown();
    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke();

    // Add more sections

    // Section 1
    doc.moveDown(2);
    doc
      .fontSize(headingFontSize)
      .text("Patient Details", { indent: 5, bold: true });
    // Section 1 content
    doc.fontSize(textFontSize).text(name, { indent: 5 });
    doc.fontSize(textFontSize).text(age, { indent: 5 });
    doc.fontSize(textFontSize).text(mobile, { indent: 5 });

    // Section 1 horizontal line
    doc.moveDown();
    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke();

    // Section 2
    doc.moveDown(2);
    // Section 3 content (based on dynamic JSON data)
    if (result_data.prediction && result_data.prediction.length > 0) {
      doc.fontSize(headingFontSize).text("Results:", { indent: 5, bold: true });
      doc.moveDown();
      result_data.prediction.forEach((result) => {
        doc.fontSize(textFontSize).text(result, { indent: 5 });
      });
    }

    if (result_data.diagnose && result_data.diagnose.length > 0) {
      doc.moveDown();
      result_data.diagnose.forEach((diagnosis) => {
        doc.fontSize(textFontSize).text(diagnosis, { indent: 5 });
      });
    }

    // Section 3 horizontal line
    doc.moveDown();
    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke();

    // Add the image with opacity
    doc.image(imageData, imageX, imageY, {
      width: imageWidth,
      height: imageHeight,
    });

    // Finalize the PDF document
    doc.end();
  } else {
    // Create a new PDF document
    const doc = new PDFDocument({ size: "A4" });
    // Set the response headers for PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=report.pdf");
    // Pipe the PDF document to the response
    doc.pipe(res);
    // Generate the PDF content
    // Set font size variables for easy customization
    const headingFontSize = 25;
    // Add heading
    doc
      .fontSize(headingFontSize)
      .text("Assessment Report", { align: "center", bold: true });
    doc.fontSize(20).text("No Data", { align: "center", bold: true });
    // Finalize the PDF document
    doc.end();
  }
});

router.post('/deleteAccount', async(req,res)=>{
  const userID = req.headers.user_id;
    let sql = `update dc.users set status = 'R' where user_id = $1`;
    let resp = await selectSql(sql,[userID]);
    res.send(resp);
});

//----------new endpoints -----------

router.get('/getUserSubscriptions', async(req,res)=>{
  const userID = req.headers.user_id;
  console.log(userID);
  let sql = `select count(*) from ai.user_subscription where status ='A' and available_credit > 0 and user_id = $1`;
  let resp = await selectSql(sql,[userID]);
  let count = resp.results[0].count;
  sql = `SELECT COALESCE((upc.credit_balance), 0) as total_credit, sp.plan_name,sp.plan_id,upc.id as credit_id FROM ai.user_plan_credits upc,ai.subscription_plans sp 
  where upc.plan_id = sp.plan_id and upc.status = 'active' and upc.user_id = $1 order by upc.id desc limit 1`;
  resp = await selectSql(sql,[userID]);
  let credit = 0;let planName = ''; let planID = ''; let credit_id = '';
  if(resp.results.length > 0){
    credit = resp.results[0].total_credit;
    planName = resp.results[0].plan_name;
    planID = resp.results[0].plan_id;
    credit_id = resp.results[0].credit_id;
  }
  let data = {};
  if(count == 0 && credit == 0){
    data.result = "no";
  }
  else if(count != 0 ){
    //get subscriptions details 
    sql = `select us.subscription_id,us.start_date,us.end_date,us.available_credit,sp.test_type_id,sp.plan_name from ai.user_subscription us,ai.subscription_plans sp
    where us.plan_id = sp.plan_id and us.status = 'A' and us.user_id = $1 order by subscription_id`;
    resp = await selectSql(sql,[userID]);
    if(resp.results.length > 0){
      //console.log(resp.results);
      let inputArray = resp.results;
      const resultArray = [];
    // Initialize sums for each test_type_id
      const sumByTestType = { 1: 0, 2: 0 };
    // Track plan_name with higher available_credit for each test_type_id
      const higherCreditPlan = { 1: null, 2: null };

    for (const obj of inputArray) {
      const { available_credit, test_type_id, plan_name, end_date } = obj;
      // Sum available_credit based on test_type_id
      sumByTestType[test_type_id] += available_credit;
      // Update plan_name with higher available_credit
    if (higherCreditPlan[test_type_id] === null || available_credit > sumByTestType[test_type_id]) {
      higherCreditPlan[test_type_id] = { plan_name, end_date: new Date(end_date).toLocaleDateString('en-GB') };
     }
    }

  // Convert the results to the desired format
    for (const test_type_id in sumByTestType) {
      if (higherCreditPlan[test_type_id] !== null) {
      resultArray.push({
      test_type_id: parseInt(test_type_id),
      sum_available_credit: sumByTestType[test_type_id],
      subscription_id: inputArray
        .filter(obj => obj.test_type_id === parseInt(test_type_id) && obj.plan_name === higherCreditPlan[test_type_id].plan_name)
        .map(obj => obj.subscription_id),
      ...higherCreditPlan[test_type_id]
    });
  }
  }
//console.log(resultArray);
      data.result = "yes";
    data.details = resultArray;
  }

   
  }
  else if(count == 0 && credit != 0){
    data.result = "credit";
    data.credit = credit;
    data.planName = planName;
    data.planID = planID;
    data.credit_id = credit_id;
  }
  res.status(200).send({ status_code: 'ai200', message: 'Success', data:data });

})


router.get('/getSubscription_profile', async(req,res)=>{
  const userID = req.headers.user_id;
  console.log(userID);
  let sql = `select us.subscription_id,TO_CHAR(us.start_date, 'DD/MM/YYYY') AS start_date,TO_CHAR(us.end_date, 'DD/MM/YYYY') AS end_date,us.pg_id,TO_CHAR(us.created_at, 'DD/MM/YYYY HH12:MI:SS AM') AS created_at,us.available_credit,sp.plan_name,sp.test_type_id from ai.user_subscription us,ai.subscription_plans sp
  where us.plan_id = sp.plan_id and us.user_id = $1 order by subscription_id desc`;
  let resp = await selectSql(sql,[userID]);
  res.send(resp);

})

router.get('/getAllUserReport', async(req,res)=>{
  const userID = req.headers.user_id;
  let sql = `select result_id,p_name,p_age,p_gender,p_mobile,test_type_id,TO_CHAR(created_at, 'DD/MM/YYYY') AS test_date from ai.user_test_results where status = 'active'
   and user_id = $1 order by result_id desc`;
  let resp = await selectSql(sql,[userID]);
  res.send(resp);

})











 

export default router;

