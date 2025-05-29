import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import * as handlebars from 'handlebars';

export interface EmailContext {
  recipientName?: string;
  recipientEmail?: string;
  songTitle?: string;
  playlistName?: string;
  artistName?: string;
  playlistMakerName?: string;
  submissionStatus?: string;
  feedback?: string;
  amount?: string;
  transactionId?: string;
  confirmationUrl?: string;
  resetUrl?: string;
  submissionUrl?: string;
  dashboardUrl?: string;
  supportUrl?: string;
  unsubscribeUrl?: string;
  [key: string]: any;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;
  private readonly frontendUrl: string;  constructor(private configService: ConfigService) {
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    
    // Only initialize transporter if email credentials are provided
    const emailUser = this.configService.get<string>('EMAIL_USER');
    const emailPass = this.configService.get<string>('EMAIL_PASS');
    
    if (emailUser && emailPass) {
      this.initializeTransporter();
    } else {
      this.logger.warn('Email credentials not provided. Email service will be disabled.');
    }
  }
  private initializeTransporter() {
    try {
      this.transporter = nodemailer.createTransport({
        host: this.configService.get<string>('EMAIL_HOST'),
        port: this.configService.get<number>('EMAIL_PORT'),
        secure: this.configService.get<string>('EMAIL_SECURE') === 'true',
        auth: {
          user: this.configService.get<string>('EMAIL_USER'),
          pass: this.configService.get<string>('EMAIL_PASS')
        },
      });
      
      // Verify connection asynchronously
      this.transporter.verify((error, success) => {
        if (error) {
          this.logger.error('Email transporter verification failed:', error);
        } else {
          this.logger.log('Email transporter is ready to send messages');
        }
      });
    } catch (error) {
      this.logger.error('Failed to initialize email transporter:', error);
    }
  }

  private getTemplate(templateName: string): string {
    try {
      const templatePath = path.join(__dirname, 'templates', `${templateName}.hbs`);
      return fs.readFileSync(templatePath, 'utf8');
    } catch (error) {
      this.logger.error(`Failed to load email template: ${templateName}`, error);
      return this.getDefaultTemplate();
    }
  }

  private getDefaultTemplate(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{title}}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        
        .email-container {
            max-width: 600px;
            margin: 20px auto;
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 30px 20px;
            text-align: center;
            color: white;
        }
        
        .logo {
            font-size: 24px;
            font-weight: bold;
            letter-spacing: 2px;
            margin-bottom: 10px;
        }
        
        .tagline {
            font-size: 14px;
            opacity: 0.9;
        }
        
        .content {
            padding: 40px 30px;
        }
        
        .title {
            font-size: 24px;
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 20px;
            text-align: center;
        }
        
        .message {
            font-size: 16px;
            line-height: 1.8;
            color: #555;
            margin-bottom: 30px;
        }
        
        .details-card {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            border-left: 4px solid #667eea;
        }
        
        .detail-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding: 5px 0;
        }
        
        .detail-label {
            font-weight: 600;
            color: #2c3e50;
        }
        
        .detail-value {
            color: #555;
        }
        
        .cta-button {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            text-align: center;
            margin: 20px 0;
            transition: transform 0.2s;
        }
        
        .cta-button:hover {
            transform: translateY(-2px);
        }
        
        .footer {
            background: #f8f9fa;
            padding: 25px 30px;
            text-align: center;
            font-size: 14px;
            color: #666;
            border-top: 1px solid #eee;
        }
        
        .footer a {
            color: #667eea;
            text-decoration: none;
        }
        
        .status-approved {
            color: #28a745;
            font-weight: bold;
        }
        
        .status-rejected {
            color: #dc3545;
            font-weight: bold;
        }
        
        .status-pending {
            color: #ffc107;
            font-weight: bold;
        }
        
        @media (max-width: 600px) {
            .email-container {
                margin: 10px;
                border-radius: 8px;
            }
            
            .content {
                padding: 30px 20px;
            }
            
            .header {
                padding: 25px 20px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <div class="logo">ENTERLIST</div>
            <div class="tagline">Connecting Artists with Playlist Makers</div>
        </div>
        
        <div class="content">
            <h1 class="title">{{title}}</h1>
            <div class="message">
                {{{content}}}
            </div>
        </div>
        
        <div class="footer">
            <p>
                Best regards,<br>
                The Enterlist Team
            </p>
            <p>
                <a href="{{dashboardUrl}}">Visit Dashboard</a> | 
                <a href="{{supportUrl}}">Support</a> | 
                <a href="{{unsubscribeUrl}}">Unsubscribe</a>
            </p>
        </div>
    </div>
</body>
</html>
    `;
  }

  private compileTemplate(templateName: string, context: EmailContext): string {
    const template = this.getTemplate(templateName);
    const compiledTemplate = handlebars.compile(template);
    
    // Add default URLs to context
    const enhancedContext = {
      ...context,
      dashboardUrl: context.dashboardUrl || `${this.frontendUrl}/dashboard`,
      supportUrl: context.supportUrl || `${this.frontendUrl}/support`,
      unsubscribeUrl: context.unsubscribeUrl || `${this.frontendUrl}/unsubscribe`,
    };
    
    return compiledTemplate(enhancedContext);
  }
  async sendEmail(
    to: string,
    subject: string,
    templateName: string,
    context: EmailContext
  ): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn('Email transporter not initialized. Cannot send email.');
      return false;
    }

    try {
      const html = this.compileTemplate(templateName, context);
        const mailOptions = {
        from: {
          name: 'Enterlist',
          address: this.configService.get<string>('EMAIL_USER') || 'noreply@enterlist.com'
        },
        to,
        subject,
        html,
      };
      
      const result = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email sent successfully to ${to}`, result?.messageId || 'No message ID');
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}:`, error);
      return false;
    }
  }

  // Specific email methods for different use cases

  async sendSubmissionReceipt(
    artistEmail: string,
    artistName: string,
    songTitle: string,
    playlistName: string,
    amount: string,
    transactionId: string
  ): Promise<boolean> {
    const context: EmailContext = {
      title: 'Submission Receipt',
      recipientName: artistName,
      songTitle,
      playlistName,
      amount,
      transactionId,
      content: `
        <p>Thank you for submitting your song "<strong>${songTitle}</strong>" to the playlist "<strong>${playlistName}</strong>".</p>
        
        <div class="details-card">
          <div class="detail-row">
            <span class="detail-label">Song:</span>
            <span class="detail-value">${songTitle}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Playlist:</span>
            <span class="detail-value">${playlistName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Amount Paid:</span>
            <span class="detail-value">$${amount}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Transaction ID:</span>
            <span class="detail-value">${transactionId}</span>
          </div>
        </div>
        
        <p>Your submission is now being reviewed by the playlist curator. You'll receive an email notification once the review is complete.</p>
        
        <a href="${this.frontendUrl}/artist/submissions" class="cta-button">View Your Submissions</a>
      `
    };

    return this.sendEmail(
      artistEmail,
      'Submission Receipt - Enterlist',
      'default',
      context
    );
  }

  async sendSubmissionNotification(
    playlistMakerEmail: string,
    playlistMakerName: string,
    songTitle: string,
    artistName: string,
    playlistName: string,
    submissionId: string
  ): Promise<boolean> {
    const context: EmailContext = {
      title: 'New Submission to Review',
      recipientName: playlistMakerName,
      songTitle,
      artistName,
      playlistName,
      submissionUrl: `${this.frontendUrl}/playlist-maker/submissions/${submissionId}`,
      content: `
        <p>You have received a new song submission for your playlist "<strong>${playlistName}</strong>".</p>
        
        <div class="details-card">
          <div class="detail-row">
            <span class="detail-label">Song:</span>
            <span class="detail-value">${songTitle}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Artist:</span>
            <span class="detail-value">${artistName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Playlist:</span>
            <span class="detail-value">${playlistName}</span>
          </div>
        </div>
        
        <p>Please review the submission and provide your feedback to the artist.</p>
        
        <a href="${this.frontendUrl}/playlist-maker/submissions/${submissionId}" class="cta-button">Review Submission</a>
      `
    };

    return this.sendEmail(
      playlistMakerEmail,
      `New Submission: ${songTitle} - Enterlist`,
      'default',
      context
    );
  }

  async sendSubmissionStatusUpdate(
    artistEmail: string,
    artistName: string,
    songTitle: string,
    playlistName: string,
    status: 'approved' | 'rejected',
    feedback?: string
  ): Promise<boolean> {
    const statusText = status === 'approved' ? 'Approved' : 'Not Selected';
    const statusClass = status === 'approved' ? 'status-approved' : 'status-rejected';
    
    const context: EmailContext = {
      title: `Submission ${statusText}`,
      recipientName: artistName,
      songTitle,
      playlistName,
      submissionStatus: status,
      feedback,
      content: `
        <p>Your submission has been reviewed by the playlist curator.</p>
        
        <div class="details-card">
          <div class="detail-row">
            <span class="detail-label">Song:</span>
            <span class="detail-value">${songTitle}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Playlist:</span>
            <span class="detail-value">${playlistName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Status:</span>
            <span class="detail-value ${statusClass}">${statusText}</span>
          </div>
        </div>
        
        ${feedback ? `
        <div class="details-card">
          <div class="detail-label">Feedback from Curator:</div>
          <div style="margin-top: 10px; font-style: italic;">"${feedback}"</div>
        </div>
        ` : ''}
        
        ${status === 'approved' 
          ? '<p>Congratulations! Your song has been added to the playlist. Keep creating great music!</p>'
          : '<p>While this submission wasn\'t selected, don\'t be discouraged. Keep refining your craft and submitting to playlists that match your style.</p>'
        }
        
        <a href="${this.frontendUrl}/artist/submissions" class="cta-button">View All Submissions</a>
      `
    };

    return this.sendEmail(
      artistEmail,
      `Submission ${statusText}: ${songTitle} - Enterlist`,
      'default',
      context
    );
  }

  async sendPasswordChangeNotification(
    userEmail: string,
    userName: string
  ): Promise<boolean> {
    const context: EmailContext = {
      title: 'Password Changed Successfully',
      recipientName: userName,
      content: `
        <p>Your account password has been successfully changed.</p>
        
        <p>If you did not make this change, please contact our support team immediately.</p>
        
        <p>For your security, make sure to:</p>
        <ul>
          <li>Use a strong, unique password</li>
          <li>Never share your password with anyone</li>
          <li>Log out from shared or public devices</li>
        </ul>
        
        <a href="${this.frontendUrl}/login" class="cta-button">Login to Your Account</a>
      `
    };

    return this.sendEmail(
      userEmail,
      'Password Changed - Enterlist',
      'default',
      context
    );
  }
  async sendEmailConfirmation(
    userEmail: string,
    userName: string,
    confirmationToken: string
  ): Promise<boolean> {
    const confirmationUrl = `${this.frontendUrl}/confirm-email-token?token=${confirmationToken}`;
    
    const context: EmailContext = {
      title: 'Confirm Your Email Address',
      recipientName: userName,
      confirmationUrl,
      content: `
        <p>Welcome to Enterlist! Please confirm your email address to complete your registration.</p>
        
        <p>Click the button below to verify your email address:</p>
        
        <a href="${confirmationUrl}" class="cta-button">Confirm Email Address</a>
        
        <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666; font-size: 14px;">${confirmationUrl}</p>
        
        <p>This link will expire in 24 hours for security reasons.</p>
        
        <p>If you didn't create an account with Enterlist, you can safely ignore this email.</p>
      `
    };

    return this.sendEmail(
      userEmail,
      'Please Confirm Your Email - Enterlist',
      'default',
      context
    );
  }

  async sendPasswordResetEmail(
    userEmail: string,
    userName: string,
    resetToken: string
  ): Promise<boolean> {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${resetToken}`;
    
    const context: EmailContext = {
      title: 'Reset Your Password',
      recipientName: userName,
      resetUrl,
      content: `
        <p>You requested to reset your password for your Enterlist account.</p>
        
        <p>Click the button below to reset your password:</p>
        
        <a href="${resetUrl}" class="cta-button">Reset Password</a>
        
        <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666; font-size: 14px;">${resetUrl}</p>
        
        <p>This link will expire in 1 hour for security reasons.</p>
        
        <p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
      `
    };

    return this.sendEmail(
      userEmail,
      'Reset Your Password - Enterlist',
      'default',
      context
    );
  }
}
