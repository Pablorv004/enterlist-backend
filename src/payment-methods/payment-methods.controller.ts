import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Delete,
    Put,
    UseGuards,
} from '@nestjs/common';
import { PaymentMethodsService } from './payment-methods.service';
import { CreatePaymentMethodDto, UpdatePaymentMethodDto } from './dto/payment-method.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { user_role } from '@prisma/client';

@Controller('api/payment-methods')
@UseGuards(JwtAuthGuard)
export class PaymentMethodsController {
    constructor(private readonly paymentMethodsService: PaymentMethodsService) { }

    @UseGuards(RolesGuard)
    @Roles(user_role.admin)
    @Get()
    findAll() {
        return this.paymentMethodsService.findAll();
    }

    @Get('artist/:artistId')
    findByArtist(@Param('artistId') artistId: string) {
        return this.paymentMethodsService.findByArtist(artistId);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.paymentMethodsService.findOne(id);
    }

    @Post()
    create(@Body() createPaymentMethodDto: CreatePaymentMethodDto) {
        return this.paymentMethodsService.create(createPaymentMethodDto);
    }

    @Put(':id')
    update(
        @Param('id') id: string,
        @Body() updatePaymentMethodDto: UpdatePaymentMethodDto,
    ) {
        return this.paymentMethodsService.update(id, updatePaymentMethodDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.paymentMethodsService.remove(id);
    }
}

