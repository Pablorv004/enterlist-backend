import { Controller, Get, Query, Req, Res, Post, Body, UseGuards, Param, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaypalAuthService } from './paypal-auth.service';
import { Response } from 'express';

@Controller('api/auth/paypal')
export class PaypalAuthController {
    constructor(
        private readonly paypalAuthService: PaypalAuthService,
        private readonly configService: ConfigService
    ) { }

    @Get('login')
    @UseGuards(JwtAuthGuard)
    async login(@Req() req, @Res() res: Response) {
        const authUrl = await this.paypalAuthService.getAuthorizationUrl(req.user.user_id);
        return res.redirect(authUrl);
    }    @Get('login-url')
    @UseGuards(JwtAuthGuard)
    async getLoginUrl(@Req() req, @Query('popup') popup: string) {
        const authUrl = await this.paypalAuthService.getAuthorizationUrl(req.user.user_id, popup === 'true');
        return { url: authUrl };
    }@Get('callback')
    async callback(
        @Query('code') code: string,
        @Query('state') state: string,
        @Query('error') error: string,
        @Query('mobile') mobile: string,
        @Query('popup') popup: string,
        @Req() req,
        @Res() res: Response,
    ) {
        const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
        const isMobile = mobile === 'true' || req.headers['user-agent']?.includes('Capacitor');
        const isPopup = popup === 'true';
        
        if (error) {
            if (isMobile) {
                return res.redirect(`enterlist://oauth/error?error=${encodeURIComponent(error)}`);
            }
            if (isPopup) {
                // For popup, create a special close page that communicates with parent
                return res.send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>PayPal Authentication</title>
                    </head>
                    <body>                        <script>
                            if (window.opener) {
                                window.opener.postMessage({
                                    type: 'PAYPAL_OAUTH_ERROR',
                                    error: '${error.replace(/'/g, "\\'")}',
                                    provider: 'paypal'
                                }, '${frontendUrl}');
                                
                                // Give time for the message to be received, then close
                                setTimeout(() => {
                                    window.close();
                                }, 500);
                            } else {
                                window.location.href = '${frontendUrl}/login?error=${encodeURIComponent(error)}';
                            }
                        </script>
                    </body>
                    </html>
                `);
            }
            return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(error)}`);
        }        try {
            const result = await this.paypalAuthService.handleCallback(code, state);
            console.log('PayPal callback result:', { 
                success: result.success,
                isNewUser: result.isNewUser,
                needsRoleSelection: result.needsRoleSelection,
                linkedAccount: result.linkedAccount,
                hasAccessToken: !!result.access_token,
                isPopup,
                isMobile
            });
            
            if (isMobile) {
                // For mobile, redirect with tokens in URL parameters
                const params = new URLSearchParams({
                    access_token: result.access_token,
                    user: JSON.stringify(result.user),
                    status: 'success',
                    provider: 'paypal',
                    isNewUser: result.isNewUser?.toString() || 'false',
                    needsRoleSelection: result.needsRoleSelection?.toString() || 'false'
                });
                return res.redirect(`enterlist://oauth/callback?${params.toString()}`);
            }
              if (isPopup) {
                // For popup, create a special close page that communicates with parent
                return res.send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>PayPal Authentication Success</title>
                    </head>
                    <body>
                        <div style="text-align: center; padding: 20px; font-family: Arial, sans-serif;">
                            <h2>✓ PayPal Account Connected Successfully</h2>
                            <p>Closing window...</p>
                        </div>                        <script>
                            function closeWindow() {
                                if (window.opener) {
                                    // Send success message to parent window
                                    window.opener.postMessage({
                                        type: 'PAYPAL_OAUTH_SUCCESS',
                                        success: true,
                                        provider: 'paypal',
                                        linkedAccount: ${result.linkedAccount || false},
                                        timestamp: Date.now()
                                    }, '*'); // Use '*' for origin to avoid issues
                                    
                                    // Wait longer to ensure message is received
                                    setTimeout(() => {
                                        try {
                                            window.close();
                                        } catch (e) {
                                            console.log('Window close failed:', e);
                                        }
                                    }, 1000);
                                } else {
                                    // Fallback if not in popup
                                    window.location.href = '${frontendUrl}/payment-methods?success=paypal-connected';
                                }
                            }
                            
                            // Try to close immediately and also set a backup timer
                            closeWindow();
                            setTimeout(closeWindow, 500);
                        </script>
                    </body>
                    </html>
                `);
            }
              // Web flow - use query parameters instead of cookies
            // Check if this is a new user or existing user that needs role selection
            if (result.access_token) {
                // This is a login/registration flow
                const params = new URLSearchParams({
                    access_token: result.access_token,
                    user: JSON.stringify(result.user),
                    status: 'success',
                    provider: 'paypal',
                    isNewUser: result.isNewUser?.toString() || 'false',
                    needsRoleSelection: result.needsRoleSelection?.toString() || 'false'
                });
                
                if (result.isNewUser || result.needsRoleSelection) {
                    return res.redirect(`${frontendUrl}/role-selection?${params.toString()}`);
                }
                
                // If existing user with role, go to dashboard
                return res.redirect(`${frontendUrl}/dashboard?${params.toString()}`);
            } else if (result.linkedAccount) {
                // This is an account linking flow for existing users
                return res.redirect(`${frontendUrl}/payment-methods?success=paypal-connected`);
            } else {
                // Fallback
                return res.redirect(`${frontendUrl}/dashboard?success=paypal-connected`);
            }
        } catch (err) {
            if (isMobile) {
                return res.redirect(`enterlist://oauth/error?error=${encodeURIComponent(err.message)}`);
            }
            if (isPopup) {
                // For popup, create a special close page that communicates with parent
                return res.send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>PayPal Authentication Error</title>
                    </head>
                    <body>                        <script>
                            function sendError() {
                                if (window.opener) {
                                    window.opener.postMessage({
                                        type: 'PAYPAL_OAUTH_ERROR',
                                        error: '${err.message.replace(/'/g, "\\'")}',
                                        provider: 'paypal',
                                        timestamp: Date.now()
                                    }, '*'); // Use '*' for origin to avoid issues
                                    
                                    // Wait longer to ensure message is received
                                    setTimeout(() => {
                                        try {
                                            window.close();
                                        } catch (e) {
                                            console.log('Window close failed:', e);
                                        }
                                    }, 1000);
                                } else {
                                    window.location.href = '${frontendUrl}/login?error=${encodeURIComponent(err.message)}';
                                }
                            }
                            
                            // Try to send error immediately and also set a backup timer
                            sendError();
                            setTimeout(sendError, 500);
                        </script>
                    </body>
                    </html>
                `);
            }
            return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(err.message)}`);
        }
    }

    @Get('user-email')
    @UseGuards(JwtAuthGuard)
    async getUserPayPalEmail(@Req() req) {
        try {
            const email = await this.paypalAuthService.getUserPayPalEmail(req.user.user_id);
            return { email };
        } catch (error) {
            throw new UnauthorizedException('PayPal account not linked or invalid');
        }
    }

    @Post('create-payment')
    @UseGuards(JwtAuthGuard)
    async createPayment(@Body() createPaymentDto: {
        amount: number;
        currency: string;
        description: string;
        returnUrl: string;
        cancelUrl: string;
    }) {
        return await this.paypalAuthService.createPayment(
            createPaymentDto.amount,
            createPaymentDto.currency,
            createPaymentDto.description,
            createPaymentDto.returnUrl,
            createPaymentDto.cancelUrl
        );
    }

    @Post('execute-payment')
    @UseGuards(JwtAuthGuard)
    async executePayment(@Body() executePaymentDto: {
        paymentId: string;
        payerId: string;
    }) {
        return await this.paypalAuthService.executePayment(
            executePaymentDto.paymentId,
            executePaymentDto.payerId
        );
    }

    @Get('payment/:id')
    @UseGuards(JwtAuthGuard)
    async getPayment(@Param('id') paymentId: string) {
        return await this.paypalAuthService.getPayment(paymentId);
    }

    @Post('create-payout')
    @UseGuards(JwtAuthGuard)
    async createPayout(@Body() createPayoutDto: {
        recipientEmail: string;
        amount: number;
        currency: string;
        note: string;
    }) {
        return await this.paypalAuthService.createPayout(
            createPayoutDto.recipientEmail,
            createPayoutDto.amount,
            createPayoutDto.currency,
            createPayoutDto.note
        );
    }

    @Get('debug-config')
    async debugConfig() {
        return {
            environment: this.paypalAuthService['environment'],
            clientId: this.paypalAuthService['clientId'],
            redirectUri: this.paypalAuthService['redirectUri'],
            baseUrl: this.paypalAuthService['baseUrl']
        };
    }
}
