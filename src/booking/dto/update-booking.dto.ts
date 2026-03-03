import { IsInt, IsDateString, IsOptional, Min } from 'class-validator';

export class UpdateBookingDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  attendees?: number;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;
}
