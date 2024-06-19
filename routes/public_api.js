import express from 'express';
import AWS from 'aws-sdk';
import { selectSql } from '../utils/pg_helper.js';
import {createEmbedding } from '../utils/embeddings.js';
import {validateSession} from '../utils/middlewares.js';
import {convertToAscii, preProcessData} from '../utils/helper.js';
import md5 from 'md5';
import multer from 'multer';
import fs from 'fs';
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { Document, RecursiveCharacterTextSplitter} from '@pinecone-database/doc-splitter';
import { PromptTemplate } from "@langchain/core/prompts";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAI } from "openai";
import { OpenAIStream, StreamingTextResponse, streamToResponse } from 'ai';
import {getContext} from './pinecontext.js'; 


const router = express.Router();
const pc = new Pinecone();
const openai = new OpenAI(process.env.OPENAI_API_KEY);

const BUCKET_NAME = process.env.S3_BUCKET;
const IAM_USER_KEY = process.env.S3_KEY;
const IAM_USER_SECRET = process.env.S3_SECRET;

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

let s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  });

  const PDFPage = {
    pageContent: "",
    metadata: {
      loc: { pageNumber: 0 }
    }
  };

router.get('/hello', async (req, res) => {
    res.status(200).send("Hello");
});

router.get('/health', (req, res) => {
  const currentDate = new Date();
  const day = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
  const date = currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const time = currentDate.toLocaleTimeString('en-US');
  const app = 'AsktoPdf';

  res.json({ day, date, time,app });
});

// Ensure the /tmp directory exists
const ensureTmpDirectoryExists = () => {
  const tmpDir = '/tmp';
  if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir);
      console.log('Temporary directory created:', tmpDir);
  } else {
      console.log('Temporary directory already exists:', tmpDir);
  }
};

// create uploadToS3(imageBuffer)
async function uploadToS3(imageBuffer,filename) {
    const key = "uploads/" + Date.now().toString() + filename.replace(" ", "-");
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key:  key,
      Body: imageBuffer,
      ContentType: 'application/pdf',
    };
  
    try {
      await s3.upload(params).promise();
      console.log('PDF uploaded to S3 successfully.');

      console.log("filename from ---->", filename);
    const fileFullname   = filename;
    const systempath = `tmp/${filename}`;
    const s3url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.amazonaws.com/${key}`;
    
       // Call the download function after successful upload
    await downloadPDFFromS3(process.env.AWS_S3_BUCKET_NAME, key, `tmp/${filename}`);

     // Return the file path as a string
    const file = {
        fileFullname,
        systempath,
        s3url,
      };

      return file;
    } catch (error) {
      console.error('Error uploading image to S3:', error);
    }
}
async function downloadPDFFromS3(bucketName, key, localFilePath) {
  console.log('inside download');
  console.log('-----s3---',bucketName, key, localFilePath);
    const downloadParams = {
      Bucket: bucketName,
      Key: key,
    };
  
    try {
      const { Body } = await s3.getObject(downloadParams).promise();
  
       // Ensure the /tmp directory exists
       ensureTmpDirectoryExists();

      // Save the PDF file locally
      fs.writeFileSync(localFilePath, Body);
      console.log(`PDF downloaded and saved locally at ${localFilePath}`);
      
      const loader = new PDFLoader(localFilePath);
    //  const loader = new PDFLoader("temp/english-guidlines-2024.pdf");
      const pages = await loader.load();

      // Step -1 PreProcess/ Data cleaning 
      const processedData = await preProcessData(pages);

      // 2. split and segment the pdf
    const documents = await Promise.all(processedData.map(prepareDocument));

    console.log("--->",documents);

    // 3. vectorise and embed individual documents
   const vectors = await Promise.all(documents.flat().map(embedDocument));

   // 4. upload to pinecone
 // const client = await getPineconeClient();
  const pineconeIndex = pc.index("ask2pdf");
  let fileKey_pinecone = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.amazonaws.com/${convertToAscii(key)}`
  const namespace = pineconeIndex.namespace(fileKey_pinecone);

  console.log("inserting vectors into pinecone");
  await namespace.upsert(vectors);
  console.log("inserted to pinecone");

  //delete local file
  fs.unlinkSync(localFilePath);
  //console.log(documents[0]);
  return documents[0];
    } catch (error) {
      console.error('Error downloading PDF from S3:', error);
      throw error;
    }
}

export const truncateStringByBytes = (str, bytes) => {
    const enc = new TextEncoder();
    return new TextDecoder("utf-8").decode(enc.encode(str).slice(0, bytes));
  };

async function prepareDocument(PDFPage) {
    let { pageContent, metadata } = PDFPage;
   // pageContent = pageContent.replace(/\n/g, "");
    // split the docs
   // const splitter = new RecursiveCharacterTextSplitter();
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 5
    });
    const docs = await splitter.splitDocuments([
      new Document({
        pageContent,
        metadata: {
          pageNumber: metadata.loc.pageNumber,
          text: pageContent,
        //   text: truncateStringByBytes(pageContent, 36000),
        },
      }),
    ]);
    return docs;
  }

  async function embedDocument(doc) {
    try {
      const embeddings = await createEmbedding(doc.pageContent);
      const hash = md5(doc.pageContent);
  
      return {
        id: hash,
        values: embeddings,
        metadata: {
          text: doc.metadata.text,
          pageNumber: doc.metadata.pageNumber,
        },
      };
    } catch (error) {
      console.log("error embedding document", error);
      throw error;
    }
  }

const generatePrompt = async (contextData) =>{
const oneInputPrompt = new PromptTemplate({
  inputVariables: ["context"],
  template: `Welcome to the Indian Government Document Chat. AI assistant is well-versed in legislative matters.
  The provided context is crucial for accurate responses. Treat it as a document.
  START CONTEXT {context} END CONTEXT
  If the context doesn't answer, AI will indicate a lack of information.
  AI will not invent information; responses are drawn directly from the context. AI provide precise and short responses, AI can answers facts on India 
  Government like prime minister, presidient and ministers name`,
});
const formattedOneInputPrompt = await oneInputPrompt.format({
  context: contextData,
});

console.log("formattedOneInputPrompt---->",formattedOneInputPrompt);

return formattedOneInputPrompt;

}


  router.post('/uploadpdf', validateSession, upload.single('pdfFile'), async (req, res) => {
    try {
      const userId = req.userId;
      const pdfBuffer = req.file.buffer;
      const fileDetails = await uploadToS3(pdfBuffer,req.file.originalname);
      console.log("fileDetails",fileDetails);

     // Use parameterized query to prevent SQL injection
    const sql = `INSERT INTO atp.chats (pdf_name, pdf_url, created_at, user_id, file_key) VALUES ($1, $2, NOW(), $3, $4) RETURNING id`;
    // Use an array to provide values for the parameters
    const values = [fileDetails.fileFullname, fileDetails.systempath, userId,fileDetails.s3url];
    const chatID = await selectSql(sql, values);
      res.send({ status_code: '200', message: 'Success', result: fileDetails, chatID: chatID });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  router.get('/allchats/:id', async (req, res) => {
    const sql =`select * from atp.chats where id=${req.params.id}`;
    const result = await selectSql(sql);
    res.send(result);
})

router.post('/ask-pdf', async (req, res) => {
    try {
        const {messages,chatId,file_key} = req.body;
       // console.log(messages,file_key,chatId);
        // const sql =`select file_key from atp.chats where id = $1`;
        // const values = [chatId];
        // const res = await selectSql(sql, values);
        // //put if condition
        // let fileKey;
        // if(res.results.length > 0){
        //  fileKey = res.results[0].file_key;
        // }

        const lastMessage = messages[messages.length - 1];
        
        const context = await getContext(lastMessage.content, file_key);
        console.log("context",context);
     //  const contextofDocument = context.map((document) => document.text).join("\n").substring(0, 5000);
    //   const promTemplate = await generatePrompt(contextofDocument);
        const contextofDocument = context.map((item) => `PAGES : ${item.pageNumber}\n${item.text}`).join("\n");
        console.log(contextofDocument);
        const prompt = {
            role: "system",
            content: `Your task is to answer the question from the information provide below, delimited by double quotes
            Information is extracted from documents its starts with PAGES which contain document page numbers which you need to provide
             in the end of your response as PAGES: . Always try to extract information from the below provided Information do not make up
             facts and take time before coming up with final answer. Always generate a answer in the same language as of question like 
             if question is in Hindi then Answer should also be in Hindi and same for English. You can provide more information if required related to question.
             If required put your answer in point-wise and use easy and simple english 
             Keep the answer short not very long. Return result in HTML format which look good, highlight important information in bold 
            Information : ""
            ${contextofDocument}
            ""
            `,
          };
         // console.log(prompt);
        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo-1106',
             messages: [ prompt,
             ...messages.filter((message) => message.role === "user"),
             ],
            stream: true,
        });
       
       console.log([ prompt,
        ...messages.filter((message) => message.role === "user"),
        ]);
         const stream = OpenAIStream(response);
        //  const stream = OpenAIStream(response, {
        //     onStart: async () => {
        //       // save user message into db
        //       await db.insert(_messages).values({
        //         chatId,
        //         content: lastMessage.content,
        //         role: "user",
        //       });
        //     },
        //     onCompletion: async (completion) => {
        //       // save ai message into db
        //       await db.insert(_messages).values({
        //         chatId,
        //         content: completion,
        //         role: "system",
        //       });
        //     },
        //   });
         return streamToResponse(stream, res);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});


export default router;