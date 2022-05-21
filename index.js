
const express = require('express')
const app = express()
require('dotenv').config()
const stripe = require("stripe")(process.env.SK_LIVE_KEY);

app.use(express.static("public"));
app.use(express.json());

const calculateOrderAmount = (items) => {
  // Replace this constant with a calculation of the order's amount
  // Calculate the order total on the server to prevent
  // people from directly manipulating the amount on the client
  return 1400;
};

// app.post("/create-payment-intent", async (req, res) => {
//   const { items } = req.body;

//   // Create a PaymentIntent with the order amount and currency
//   const paymentIntent = await stripe.paymentIntents.create({
//     amount: calculateOrderAmount(items),
//     currency: "eur",
//     automatic_payment_methods: {
//       enabled: true,
//     },
//   });

//   res.send({
//     clientSecret: paymentIntent.client_secret,
//   });
// });

app.listen(4242, () => console.log("Node server listening on port 4242!"));
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { MongoClient, ServerApiVersion, LEGAL_TCP_SOCKET_OPTIONS, ObjectId } = require('mongodb');
const { get } = require('express/lib/response');
const port = process.env.PORT || 5000;



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.bxlq4.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 })
console.log(uri);


app.use(cors())
app.use(express.json())

function verifyJWT(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res.status(401).send({ message: "Unauthorized" })
  }
  const token = authorization.split(' ')[1];


  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(402).send({ message: "Forbidden access" })
    }
    req.decoded = decoded

    next()

  });

}



async function run() {
  try {
    await client.connect()
    const doctorsAppoinment = client.db("doctors_portal").collection("appointment");
    const bookingCollection = client.db("doctors_portal").collection("Booking");
    const userCollection = client.db("doctors_portal").collection("user");
    const doctorsCollection = client.db("doctors_portal").collection("doctors");
    const paymentCollection = client.db("doctors_portal").collection("payment");
    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requestFind = await userCollection.findOne({ email: requester });
      if (requestFind.role === 'admin') {
        next()
      }
      else {

        return res.status(403).send({ message: "Forbidden" })

      }

    }

    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const service = req.body;
      const price = service.price;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({ clientSecret: paymentIntent.client_secret })
    });


    app.get('/service', async (req, res) => {
      const query = {}
      const cursor = doctorsAppoinment.find(query).project({ name: 1 });
      const result = await cursor.toArray();
      res.send(result)
    })
    app.get('/admin/:email', async (req, res) => {
      const email = req.params.email;
      const findAdmin = await userCollection.findOne({ email: email })


      console.log(findAdmin);

      const isAdmin = findAdmin.role === 'admin';
      res.send({ admin: isAdmin })
    })

    app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;


      const filter = { email: email };

      const updateDoc = {
        $set: { role: "admin" },

      };

      const result = await userCollection.updateOne(filter, updateDoc);
      res.send({ result });



    })

    app.patch('/booking/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId
        }
      }

      const result = await paymentCollection.insertOne(payment);
      const updatedBooking = await bookingCollection.updateOne(filter, updatedDoc);
      res.send(updatedBooking);
    })

    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;




      const filter = { email: email };

      const options = { upsert: true };
      const updateDoc = {
        $set: user,

      };
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });


      const result = await userCollection.updateOne(filter, updateDoc, options);
      res.send({ result, accessToken: token });
    })



    /*
    1.app.get it will get data from sarver
    2.app.get 'param/:id' its will get specific item
    3.app.patch it will update specific item and specific properties
    4.app.post  it will add new item
    5.app.delete it will delete item
    */
    app.post('/booking', async (req, res) => {
      const booking = req.body;

      const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }

      const exists = await bookingCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, booking: exists })
      }
      const result = await bookingCollection.insertOne(booking);
      res.send({ success: true, result })
    })
    app.get('/booking/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) }
      const result = await bookingCollection.findOne(query)
      res.send(result)
    })


    app.get('/booking', verifyJWT, async (req, res) => {
      const patient = req.query.patient;

      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { patient: patient }
        const bookings = await bookingCollection.find(query).toArray();

        res.send(bookings);
      }
      else {
        return res.status(403).send({ message: "Forbidden Access" })
      }

    })
    app.get('/user', async (req, res) => {
      const user = await userCollection.find().toArray();
      res.send(user)
    })
    app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = await doctorsCollection.find().toArray();
      res.send(doctor)
    })

    app.get('/available', async (req, res) => {
      const date = req.query.date;


      //  step 1 :get all access services 


      const services = await doctorsAppoinment.find().toArray();


      // step 2 : get the booking of that day

      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();



      // step 3 :for Each service find bookings for that service
      services.forEach(service => {
        const serviceBookings = bookings.filter(b => b.treatment == service.name)

        const booked = serviceBookings.map(s => s.slots);

        const available = service.slots.filter(s => !booked.includes(s))
        service.slots = available;
      })
      res.send(services)

    })
    app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
      const body = req.body;
      const result = await doctorsCollection.insertOne(body)
      res.send(result)

    })
    app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const query = { email: email }
      const result = await doctorsCollection.deleteOne(query)
      res.send(result)

    })



  }
  finally {

  }
}
run().catch(console.dir)




app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
