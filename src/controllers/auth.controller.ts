import type { RequestHandler } from 'express';
import * as authService from '../services/auth.service';
import type { LoginUserInput, RegisterUserInput } from '../types/auth';

const register: RequestHandler = async (req, res) => {
  try {
    const { email, phone, password } = req.body as RegisterUserInput;
    const newUser = await authService.registerUser({ email, phone, password });
    res.status(201).json({
      success: true,
      message: 'Account initialized successfully.',
      data: newUser,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed.';
    res.status(400).json({ success: false, message });
  }
};

const login: RequestHandler = async (req, res) => {
  try {
    const { email, phone, password } = req.body as LoginUserInput;
    const sessionData = await authService.loginUser({ email, phone, password });
    res.status(200).json({
      success: true,
      message: 'Authentication successful.',
      data: sessionData,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed.';
    res.status(401).json({ success: false, message });
  }
};

export { register, login };
