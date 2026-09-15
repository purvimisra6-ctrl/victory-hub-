const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const associateModel = require('../models/associate');

router.get('/login', (req, res) => {
  if (req.session.associateId) return res.redirect('/dashboard');
  res.render('login', { title: 'Login', error: null, companyName: process.env.COMPANY_NAME || 'Company Hub' });
});

router.post('/login',
  body('email').isEmail(),
  body('password').notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render('login', { title: 'Login', error: 'Please enter a valid email and password', companyName: process.env.COMPANY_NAME });
    }
    try {
      const { email, password } = req.body;
      const associate = await associateModel.findByEmail(email);
      if (!associate) {
        return res.render('login', { title: 'Login', error: 'Invalid email or password', companyName: process.env.COMPANY_NAME });
      }
      const ok = await associateModel.verifyPassword(password, associate.password_hash);
      if (!ok) {
        return res.render('login', { title: 'Login', error: 'Invalid email or password', companyName: process.env.COMPANY_NAME });
      }
      if (associate.status !== 'active') {
        return res.render('login', { title: 'Login', error: 'Your account is not active. Contact admin.', companyName: process.env.COMPANY_NAME });
      }
      req.session.associateId = associate.id;
      req.session.role = associate.role;
      req.session.name = associate.name;
      res.redirect(associate.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      console.error(err);
      res.render('login', { title: 'Login', error: 'Something went wrong. Try again.', companyName: process.env.COMPANY_NAME });
    }
  }
);

// Signup ONLY via a valid referral link (?ref=CODE) - keeps the tree consistent
router.get('/signup', async (req, res) => {
  const { ref } = req.query;
  let sponsor = null;
  if (ref) sponsor = await associateModel.findByReferralCode(ref);
  res.render('signup', { title: 'Join', error: null, ref: ref || '', sponsor, companyName: process.env.COMPANY_NAME });
});

router.post('/signup',
  body('name').trim().notEmpty(),
  body('email').isEmail(),
  body('phone').trim().isLength({ min: 8 }),
  body('password').isLength({ min: 6 }),
  async (req, res) => {
    const errors = validationResult(req);
    const { name, email, phone, password, ref, city } = req.body;
    if (!errors.isEmpty()) {
      const sponsor = ref ? await associateModel.findByReferralCode(ref) : null;
      return res.render('signup', { title: 'Join', error: 'Please fill all fields correctly (password min 6 chars).', ref, sponsor, companyName: process.env.COMPANY_NAME });
    }
    try {
      let parentId = null;
      let sponsor = null;
      if (ref) {
        sponsor = await associateModel.findByReferralCode(ref);
        if (sponsor) parentId = sponsor.id;
      }
      const existing = await associateModel.findByEmail(email);
      if (existing) {
        return res.render('signup', { title: 'Join', error: 'Email already registered.', ref, sponsor, companyName: process.env.COMPANY_NAME });
      }
      const associate = await associateModel.createAssociate({ name, email, phone, password, parentId, city });
      req.session.associateId = associate.id;
      req.session.role = associate.role;
      req.session.name = associate.name;
      res.redirect('/dashboard');
    } catch (err) {
      console.error(err);
      const sponsor = ref ? await associateModel.findByReferralCode(ref) : null;
      res.render('signup', { title: 'Join', error: 'Could not create account (email/phone may already exist).', ref, sponsor, companyName: process.env.COMPANY_NAME });
    }
  }
);

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
